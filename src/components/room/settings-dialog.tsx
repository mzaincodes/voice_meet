"use client";

import { Info, Mic } from "lucide-react";
import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { AudioDeviceOption, RoomSettings } from "@/types";

/** Radix rejects an empty string as an item value, so null needs a stand-in. */
const SYSTEM_DEFAULT = "__system_default__";

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: ReactNode;
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  disabled = false,
  onCheckedChange,
  children,
}: ToggleRowProps) {
  const descriptionId = `${id}-description`;

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
        {children}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: RoomSettings;
  onSettingsChange: (patch: Partial<RoomSettings>) => void;
  devices: AudioDeviceOption[];
  speechSupported: boolean;
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
  devices,
  speechSupported,
}: SettingsDialogProps) {
  // Before permission is granted, enumerateDevices() returns a placeholder entry
  // with an empty deviceId, which Radix rejects as an item value.
  const selectableDevices = devices.filter((device) => device.deviceId !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Audio settings</DialogTitle>
          <DialogDescription>
            Changes apply to your microphone immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="input-device" className="text-sm font-medium">
            Microphone
          </Label>
          <Select
            value={settings.inputDeviceId ?? SYSTEM_DEFAULT}
            onValueChange={(value) =>
              onSettingsChange({
                inputDeviceId: value === SYSTEM_DEFAULT ? null : value,
              })
            }
          >
            <SelectTrigger id="input-device" className="w-full">
              <span className="flex min-w-0 items-center gap-2">
                <Mic aria-hidden="true" className="size-4 shrink-0" />
                <SelectValue placeholder="System default" />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SYSTEM_DEFAULT}>System default</SelectItem>
              {selectableDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectableDevices.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No microphones detected yet. Grant microphone access to see the
              full list.
            </p>
          ) : null}
        </div>

        <Separator />

        <div className="divide-y divide-border/60">
          <ToggleRow
            id="noise-suppression"
            label="Noise suppression"
            description="Filters out steady background noise like fans and traffic."
            checked={settings.noiseSuppression}
            onCheckedChange={(checked) =>
              onSettingsChange({ noiseSuppression: checked })
            }
          />
          <ToggleRow
            id="echo-cancellation"
            label="Echo cancellation"
            description="Stops others from hearing themselves through your speakers."
            checked={settings.echoCancellation}
            onCheckedChange={(checked) =>
              onSettingsChange({ echoCancellation: checked })
            }
          />
          <ToggleRow
            id="auto-gain-control"
            label="Automatic gain control"
            description="Evens out your volume as you move closer to or further from the mic."
            checked={settings.autoGainControl}
            onCheckedChange={(checked) =>
              onSettingsChange({ autoGainControl: checked })
            }
          />
          <ToggleRow
            id="profanity-filter"
            label="Language monitoring"
            description="Flags offensive language detected in speech, on this device only."
            checked={settings.profanityFilter && speechSupported}
            disabled={!speechSupported}
            onCheckedChange={(checked) =>
              onSettingsChange({ profanityFilter: checked })
            }
          >
            {speechSupported ? null : (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/12 px-2 py-1.5 text-xs text-muted-foreground">
                <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                <span>
                  Speech recognition isn&rsquo;t supported in this browser. Try
                  Chrome or Edge to enable monitoring.
                </span>
              </p>
            )}
          </ToggleRow>
        </div>
      </DialogContent>
    </Dialog>
  );
}
