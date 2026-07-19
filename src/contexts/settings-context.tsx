"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { RoomSettings } from "@/types";

const STORAGE_KEY = "voicemeet:settings";

const DEFAULT_SETTINGS: RoomSettings = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  profanityFilter: true,
  inputDeviceId: null,
};

interface SettingsContextValue {
  settings: RoomSettings;
  updateSettings: (patch: Partial<RoomSettings>) => void;
  resetSettings: () => void;
  /** False until the persisted value has been read, so we never flash defaults. */
  isHydrated: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function parseStored(raw: string | null): Partial<RoomSettings> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Partial<RoomSettings>)
      : {};
  } catch {
    return {};
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [isHydrated, setIsHydrated] = useState(false);

  // Read from localStorage after mount so server and client render identically.
  useEffect(() => {
    setSettings({ ...DEFAULT_SETTINGS, ...parseStored(window.localStorage.getItem(STORAGE_KEY)) });
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private browsing / quota — settings simply won't persist.
    }
  }, [settings, isHydrated]);

  const updateSettings = useCallback((patch: Partial<RoomSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings, isHydrated }),
    [settings, updateSettings, resetSettings, isHydrated],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
