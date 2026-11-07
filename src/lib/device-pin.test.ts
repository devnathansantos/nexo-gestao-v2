import { describe, expect, it } from "vitest";
import {
  createDevicePin,
  devicePinStorageKey,
  DEVICE_PIN_ITERATIONS,
  getDevicePinStatus,
  removeDevicePin,
  resetDevicePin,
  verifyDevicePin,
  type PinStorage,
} from "./device-pin";

class MemoryStorage implements PinStorage {
  readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

describe("PIN local do aparelho", () => {
  it("persiste somente salt, derivação e metadados; verifica o PIN após reabrir o storage", async () => {
    const storage = new MemoryStorage();
    await createDevicePin("empresa-a", "123456", storage);
    const serialized = storage.getItem(devicePinStorageKey("empresa-a"))!;
    expect(serialized).not.toContain("123456");
    const saved = JSON.parse(serialized);
    expect(saved.iterations).toBe(DEVICE_PIN_ITERATIONS);
    expect(saved.salt).toBeTypeOf("string");
    expect(saved.digest).toBeTypeOf("string");
    expect(Object.keys(saved).sort()).toEqual([
      "blockLevel",
      "blockedUntil",
      "digest",
      "failures",
      "iterations",
      "salt",
      "version",
    ]);
    const reopened = new MemoryStorage();
    reopened.setItem(devicePinStorageKey("empresa-a"), serialized);
    expect(getDevicePinStatus("empresa-a", reopened).enabled).toBe(true);
    await expect(
      verifyDevicePin("empresa-a", "123456", reopened),
    ).resolves.toBeUndefined();
  });

  it("separa as contas e usa um salt diferente para o mesmo PIN", async () => {
    const storage = new MemoryStorage();
    await createDevicePin("empresa-a", "321654", storage);
    await createDevicePin("empresa-b", "321654", storage);
    expect(storage.getItem(devicePinStorageKey("empresa-a"))).not.toEqual(
      storage.getItem(devicePinStorageKey("empresa-b")),
    );
    expect(getDevicePinStatus("empresa-c", storage).enabled).toBe(false);
    await expect(
      verifyDevicePin("empresa-c", "321654", storage),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    resetDevicePin("empresa-a", storage);
    expect(getDevicePinStatus("empresa-a", storage).enabled).toBe(false);
    expect(getDevicePinStatus("empresa-b", storage).enabled).toBe(true);
  });

  it("não aceita substituir um PIN configurado sem removê-lo antes", async () => {
    const storage = new MemoryStorage();
    await createDevicePin("empresa-a", "123456", storage);
    await expect(
      createDevicePin("empresa-a", "654321", storage),
    ).rejects.toMatchObject({ code: "ALREADY_CONFIGURED" });
    await expect(
      verifyDevicePin("empresa-a", "123456", storage),
    ).resolves.toBeUndefined();
  });

  it("preserva a pausa por tentativas ao reabrir e aumenta a pausa após novo bloco", async () => {
    const storage = new MemoryStorage();
    await createDevicePin("empresa-a", "123456", storage);
    const now = 1_800_000_000_000;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(
        verifyDevicePin("empresa-a", "000000", storage, now),
      ).rejects.toMatchObject({
        code: attempt === 5 ? "COOLDOWN" : "WRONG_PIN",
      });
    }
    const reopened = new MemoryStorage();
    reopened.setItem(
      devicePinStorageKey("empresa-a"),
      storage.getItem(devicePinStorageKey("empresa-a"))!,
    );
    expect(getDevicePinStatus("empresa-a", reopened).blockedUntil).toBe(
      now + 60_000,
    );
    await expect(
      verifyDevicePin("empresa-a", "123456", reopened, now + 30_000),
    ).rejects.toMatchObject({ code: "COOLDOWN", retryAfter: now + 60_000 });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(
        verifyDevicePin("empresa-a", "000000", reopened, now + 61_000),
      ).rejects.toBeDefined();
    }
    expect(getDevicePinStatus("empresa-a", reopened).blockedUntil).toBe(
      now + 61_000 + 120_000,
    );
    await verifyDevicePin("empresa-a", "123456", reopened, now + 182_000);
    const saved = JSON.parse(
      reopened.getItem(devicePinStorageKey("empresa-a"))!,
    );
    expect(saved.failures).toBe(0);
    expect(saved.blockedUntil).toBe(0);
    expect(saved.blockLevel).toBe(0);
  });

  it("exige PIN correto para remover e não apaga outra conta", async () => {
    const storage = new MemoryStorage();
    await createDevicePin("empresa-a", "123456", storage);
    await createDevicePin("empresa-b", "654321", storage);
    await expect(
      removeDevicePin("empresa-a", "000000", storage),
    ).rejects.toMatchObject({ code: "WRONG_PIN" });
    expect(getDevicePinStatus("empresa-a", storage).enabled).toBe(true);
    await removeDevicePin("empresa-a", "123456", storage);
    expect(getDevicePinStatus("empresa-a", storage).enabled).toBe(false);
    expect(getDevicePinStatus("empresa-b", storage).enabled).toBe(true);
  });

  it.each(["", "12345", "1234567", "abcdef", "12 456", "１２３４５６"])(
    "recusa formato inválido sem configurar PIN: %s",
    async (pin) => {
      const storage = new MemoryStorage();
      await expect(
        createDevicePin("empresa-a", pin, storage),
      ).rejects.toMatchObject({ code: "INVALID_FORMAT" });
      expect(storage.items.size).toBe(0);
    },
  );

  it("não trata registros corrompidos ou armazenamento negado como PIN desativado", () => {
    const storage = new MemoryStorage();
    storage.setItem(devicePinStorageKey("empresa-a"), "{broken");
    expect(() => getDevicePinStatus("empresa-a", storage)).toThrow(
      "Não foi possível ler o PIN",
    );
    const denied: PinStorage = {
      getItem() {
        throw new Error("Denied");
      },
      setItem() {
        throw new Error("Denied");
      },
      removeItem() {
        throw new Error("Denied");
      },
    };
    expect(() => getDevicePinStatus("empresa-a", denied)).toThrow(
      "Não foi possível ler o PIN",
    );
  });

  it("recusa iterações ou tentativas inválidas de um registro alterado", async () => {
    const storage = new MemoryStorage();
    await createDevicePin("empresa-a", "123456", storage);
    const valid = JSON.parse(
      storage.getItem(devicePinStorageKey("empresa-a"))!,
    );
    storage.setItem(
      devicePinStorageKey("empresa-a"),
      JSON.stringify({ ...valid, iterations: 1 }),
    );
    expect(() => getDevicePinStatus("empresa-a", storage)).toThrow();
    storage.setItem(
      devicePinStorageKey("empresa-a"),
      JSON.stringify({ ...valid, failures: -1 }),
    );
    expect(() => getDevicePinStatus("empresa-a", storage)).toThrow();
  });
});
