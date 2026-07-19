"use client";

import { useCallback, useEffect, useState } from "react";

import type { AudioDeviceOption } from "@/types";

function isSupportedEnvironment(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices !== "undefined" &&
    typeof navigator.mediaDevices.enumerateDevices === "function"
  );
}

export interface UseMediaDevicesResult {
  devices: AudioDeviceOption[];
  refresh: () => Promise<void>;
  isSupported: boolean;
}

/**
 * Lists the available microphones and keeps the list in sync as hardware is
 * plugged in or removed.
 */
export function useMediaDevices(): UseMediaDevicesResult {
  const [devices, setDevices] = useState<AudioDeviceOption[]>([]);
  const [isSupported, setIsSupported] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSupportedEnvironment()) return;

    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((device) => device.kind === "audioinput");

      setDevices(
        inputs.map((device, index) => ({
          deviceId: device.deviceId,
          // Labels are empty until the user grants mic permission, so fall back
          // to a stable positional name rather than rendering blank options.
          label:
            device.label.trim() ||
            (device.deviceId === "default"
              ? "System default microphone"
              : `Microphone ${index + 1}`),
        })),
      );
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    if (!isSupportedEnvironment()) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);

    void refresh();

    const handleChange = (): void => {
      void refresh();
    };
    navigator.mediaDevices.addEventListener("devicechange", handleChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleChange);
    };
  }, [refresh]);

  return { devices, refresh, isSupported };
}
