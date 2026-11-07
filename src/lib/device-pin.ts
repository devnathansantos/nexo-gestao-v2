/** Local screen lock only. It is not MFA and does not authorize Supabase requests. */
export const DEVICE_PIN_LENGTH = 6;
export const DEVICE_PIN_ITERATIONS = 310_000;
export const DEVICE_PIN_MAX_FAILURES = 5;

export interface PinStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PinRecord {
  version: 1;
  salt: string;
  digest: string;
  iterations: number;
  failures: number;
  blockedUntil: number;
  blockLevel: number;
}

export type DevicePinErrorCode =
  | "INVALID_FORMAT"
  | "WRONG_PIN"
  | "COOLDOWN"
  | "STORAGE"
  | "UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "ALREADY_CONFIGURED";

export class DevicePinError extends Error {
  readonly code: DevicePinErrorCode;
  readonly retryAfter: number;

  constructor(code: DevicePinErrorCode, message: string, retryAfter = 0) {
    super(message);
    this.name = "DevicePinError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function devicePinStorageKey(userId: string): string {
  if (!userId.trim())
    throw new DevicePinError(
      "UNAVAILABLE",
      "Entre na sua conta para configurar o PIN.",
    );
  return `nexo:device-pin:v1:${encodeURIComponent(userId)}`;
}

function resolveStorage(storage?: PinStorage): PinStorage {
  if (storage) return storage;
  try {
    if (!globalThis.localStorage) throw new Error("Unavailable");
    return globalThis.localStorage;
  } catch {
    throw new DevicePinError(
      "STORAGE",
      "O navegador não permite salvar o PIN neste aparelho. Verifique as configurações de armazenamento.",
    );
  }
}

function encode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function readRecord(userId: string, storage: PinStorage): PinRecord | null {
  try {
    const raw = storage.getItem(devicePinStorageKey(userId));
    if (raw === null) return null;
    const record: unknown = JSON.parse(raw);
    if (!record || typeof record !== "object")
      throw new Error("Invalid record");
    const value = record as Partial<PinRecord>;
    if (
      value.version !== 1 ||
      typeof value.salt !== "string" ||
      typeof value.digest !== "string" ||
      !Number.isInteger(value.iterations) ||
      value.iterations! < 210_000 ||
      value.iterations! > 1_000_000 ||
      !Number.isInteger(value.failures) ||
      value.failures! < 0 ||
      value.failures! >= DEVICE_PIN_MAX_FAILURES ||
      !Number.isSafeInteger(value.blockedUntil) ||
      value.blockedUntil! < 0 ||
      !Number.isInteger(value.blockLevel) ||
      value.blockLevel! < 0 ||
      value.blockLevel! > 10 ||
      decode(value.salt).length !== 16 ||
      decode(value.digest).length !== 32
    ) {
      throw new Error("Invalid record");
    }
    return value as PinRecord;
  } catch (error) {
    if (error instanceof DevicePinError) throw error;
    throw new DevicePinError(
      "STORAGE",
      "Não foi possível ler o PIN deste aparelho. Entre novamente com sua senha para redefini-lo.",
    );
  }
}

function writeRecord(
  userId: string,
  storage: PinStorage,
  record: PinRecord,
): void {
  try {
    storage.setItem(devicePinStorageKey(userId), JSON.stringify(record));
  } catch {
    throw new DevicePinError(
      "STORAGE",
      "Não foi possível salvar o PIN. O armazenamento deste navegador pode estar bloqueado ou cheio.",
    );
  }
}

function validateFormat(pin: string): void {
  if (!/^\d{6}$/.test(pin)) {
    throw new DevicePinError(
      "INVALID_FORMAT",
      "Use um PIN com exatamente 6 números.",
    );
  }
}

function cryptoProvider(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new DevicePinError(
      "UNAVAILABLE",
      "O PIN precisa de uma conexão segura HTTPS e de um navegador atualizado.",
    );
  }
  return globalThis.crypto;
}

async function derive(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const provider = cryptoProvider();
  const key = await provider.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await provider.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** Fixed-size digest comparison without a data-dependent early return. */
function sameDigest(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < 32; index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export function getDevicePinStatus(
  userId: string,
  storage?: PinStorage,
): { enabled: boolean; blockedUntil: number } {
  const record = readRecord(userId, resolveStorage(storage));
  return { enabled: record !== null, blockedUntil: record?.blockedUntil ?? 0 };
}

export async function createDevicePin(
  userId: string,
  pin: string,
  storage?: PinStorage,
): Promise<void> {
  validateFormat(pin);
  const selected = resolveStorage(storage);
  if (readRecord(userId, selected))
    throw new DevicePinError(
      "ALREADY_CONFIGURED",
      "Remova o PIN atual antes de configurar outro.",
    );
  const salt = cryptoProvider().getRandomValues(new Uint8Array(16));
  const digest = await derive(pin, salt, DEVICE_PIN_ITERATIONS);
  writeRecord(userId, selected, {
    version: 1,
    salt: encode(salt),
    digest: encode(digest),
    iterations: DEVICE_PIN_ITERATIONS,
    failures: 0,
    blockedUntil: 0,
    blockLevel: 0,
  });
}

export async function verifyDevicePin(
  userId: string,
  pin: string,
  storage?: PinStorage,
  now = Date.now(),
): Promise<void> {
  validateFormat(pin);
  const selected = resolveStorage(storage);
  const record = readRecord(userId, selected);
  if (!record)
    throw new DevicePinError(
      "NOT_CONFIGURED",
      "Nenhum PIN está configurado para esta conta neste aparelho.",
    );
  if (record.blockedUntil > now) {
    const seconds = Math.ceil((record.blockedUntil - now) / 1_000);
    throw new DevicePinError(
      "COOLDOWN",
      `Muitas tentativas. Aguarde ${seconds} segundos e tente novamente.`,
      record.blockedUntil,
    );
  }
  const candidate = await derive(pin, decode(record.salt), record.iterations);
  if (sameDigest(candidate, decode(record.digest))) {
    writeRecord(userId, selected, {
      ...record,
      failures: 0,
      blockedUntil: 0,
      blockLevel: 0,
    });
    return;
  }
  const failures = record.failures + 1;
  if (failures >= DEVICE_PIN_MAX_FAILURES) {
    const delay = Math.min(30 * 60_000, 60_000 * 2 ** record.blockLevel);
    const blockedUntil = now + delay;
    writeRecord(userId, selected, {
      ...record,
      failures: 0,
      blockedUntil,
      blockLevel: Math.min(10, record.blockLevel + 1),
    });
    throw new DevicePinError(
      "COOLDOWN",
      `Muitas tentativas. Aguarde ${Math.ceil(delay / 1_000)} segundos e tente novamente.`,
      blockedUntil,
    );
  }
  writeRecord(userId, selected, { ...record, failures, blockedUntil: 0 });
  throw new DevicePinError(
    "WRONG_PIN",
    `PIN incorreto. Restam ${DEVICE_PIN_MAX_FAILURES - failures} tentativas antes da pausa de segurança.`,
  );
}

export async function removeDevicePin(
  userId: string,
  pin: string,
  storage?: PinStorage,
): Promise<void> {
  const selected = resolveStorage(storage);
  await verifyDevicePin(userId, pin, selected);
  resetDevicePin(userId, selected);
}

/** Recovery only: the caller must require a fresh account-password authentication first. */
export function resetDevicePin(userId: string, storage?: PinStorage): void {
  try {
    resolveStorage(storage).removeItem(devicePinStorageKey(userId));
  } catch (error) {
    if (error instanceof DevicePinError) throw error;
    throw new DevicePinError(
      "STORAGE",
      "Não foi possível remover o PIN deste aparelho.",
    );
  }
}
