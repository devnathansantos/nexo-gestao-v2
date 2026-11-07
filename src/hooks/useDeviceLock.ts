import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDevicePin,
  devicePinStorageKey,
  getDevicePinStatus,
  removeDevicePin,
  resetDevicePin,
  verifyDevicePin,
} from "../lib/device-pin";

export interface DeviceLockState {
  enabled: boolean;
  locked: boolean;
  loading: boolean;
  error: string | null;
  enable(pin: string): Promise<void>;
  disable(pin: string): Promise<void>;
  unlock(pin: string): Promise<void>;
  /** Call only after a successful fresh password login requested to recover the PIN. */
  resetAfterPassword(): void;
  lock(): void;
}

interface State {
  userId: string | undefined;
  enabled: boolean;
  locked: boolean;
  loading: boolean;
  error: string | null;
}

const IDLE_MS = 5 * 60_000;

export function useDeviceLock(userId: string | undefined): DeviceLockState {
  const [state, setState] = useState<State>({
    userId: undefined,
    enabled: false,
    locked: false,
    loading: false,
    error: null,
  });
  const activeUser = useRef(userId);
  activeUser.current = userId;
  const busy = useRef(false);

  const readStatus = useCallback((id: string, lockEnabled: boolean) => {
    try {
      const { enabled } = getDevicePinStatus(id);
      setState({
        userId: id,
        enabled,
        locked: enabled && lockEnabled,
        loading: false,
        error: null,
      });
    } catch (error) {
      // A damaged/unreadable existing setting must not silently display business data.
      setState({
        userId: id,
        enabled: true,
        locked: true,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível verificar o PIN.",
      });
    }
  }, []);

  useEffect(() => {
    busy.current = false;
    if (!userId) {
      setState({
        userId: undefined,
        enabled: false,
        locked: false,
        loading: false,
        error: null,
      });
      return;
    }
    readStatus(userId, true);
  }, [userId, readStatus]);

  const lock = useCallback(() => {
    setState((current) =>
      current.userId === activeUser.current && current.enabled
        ? { ...current, locked: true, error: null }
        : current,
    );
  }, []);

  const operation = useCallback(
    async (kind: "enable" | "disable" | "unlock", pin: string) => {
      const id = userId;
      if (!id) throw new Error("Entre na sua conta para usar o PIN.");
      if (busy.current) throw new Error("Aguarde a verificação atual do PIN.");
      busy.current = true;
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        if (kind === "enable") await createDevicePin(id, pin);
        if (kind === "disable") await removeDevicePin(id, pin);
        if (kind === "unlock") await verifyDevicePin(id, pin);
        if (activeUser.current === id) {
          setState({
            userId: id,
            enabled: kind !== "disable",
            locked: false,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        if (activeUser.current === id) {
          setState((current) => ({
            ...current,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível verificar o PIN.",
          }));
        }
        throw error;
      } finally {
        busy.current = false;
      }
    },
    [userId],
  );

  const enable = useCallback(
    (pin: string) => operation("enable", pin),
    [operation],
  );
  const disable = useCallback(
    (pin: string) => operation("disable", pin),
    [operation],
  );
  const unlock = useCallback(
    (pin: string) => operation("unlock", pin),
    [operation],
  );
  const resetAfterPassword = useCallback(() => {
    if (!userId)
      throw new Error(
        "Entre novamente com sua senha antes de redefinir o PIN.",
      );
    resetDevicePin(userId);
    setState({
      userId,
      enabled: false,
      locked: false,
      loading: false,
      error: null,
    });
  }, [userId]);

  useEffect(() => {
    if (!userId || !state.enabled || state.locked || state.userId !== userId)
      return;
    let timer: ReturnType<typeof setTimeout>;
    let lastActivity = Date.now();
    const reset = () => {
      lastActivity = Date.now();
      clearTimeout(timer);
      timer = setTimeout(lock, IDLE_MS);
    };
    const checkVisible = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastActivity >= IDLE_MS) lock();
        else {
          clearTimeout(timer);
          timer = setTimeout(lock, IDLE_MS - (Date.now() - lastActivity));
        }
      }
    };
    const activity = ["pointerdown", "keydown", "touchstart"] as const;
    activity.forEach((event) =>
      window.addEventListener(event, reset, { passive: true }),
    );
    document.addEventListener("visibilitychange", checkVisible);
    reset();
    return () => {
      clearTimeout(timer);
      activity.forEach((event) => window.removeEventListener(event, reset));
      document.removeEventListener("visibilitychange", checkVisible);
    };
  }, [userId, state.enabled, state.locked, state.userId, lock]);

  useEffect(() => {
    if (!userId) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === devicePinStorageKey(userId))
        readStatus(userId, true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId, readStatus]);

  // Before effects run for another account, hide the previous account's state.
  const current =
    state.userId === userId
      ? state
      : {
          enabled: false,
          locked: Boolean(userId),
          loading: Boolean(userId),
          error: null,
        };
  return {
    enabled: current.enabled,
    locked: current.locked,
    loading: current.loading,
    error: current.error,
    enable,
    disable,
    unlock,
    resetAfterPassword,
    lock,
  };
}
