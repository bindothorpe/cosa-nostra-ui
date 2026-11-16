"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatPhaseDuration,
  invalidPhaseDurations,
  MAX_PHASE_SECONDS,
  MIN_PHASE_SECONDS,
  PHASE_KEYS,
} from "@/components/game/room-config";
import type {
  ConfigurablePhase,
  PhaseDurations,
  RoomPreset,
} from "@/components/game/types";

export function PhaseTimers({
  preset,
  onPresetChange,
  durations,
  onChange,
}: {
  preset: RoomPreset;
  onPresetChange: (preset: RoomPreset) => void;
  durations: PhaseDurations;
  onChange: (phase: ConfigurablePhase, durationMs: number) => void;
}) {
  const t = useTranslations("CreateRoom");
  const configT = useTranslations("RoomConfig");
  const invalid = invalidPhaseDurations(durations);
  const invalidSet = new Set(invalid);

  return (
    <div className="space-y-4">
      <Tabs
        value={preset}
        onValueChange={(value) => onPresetChange(value as RoomPreset)}
      >
        <TabsList className="grid h-16 w-full grid-cols-2 rounded-xl bg-muted/60 p-1">
          <TabsTrigger value="default" className="h-full rounded-lg text-xs">
            {t("default")}
          </TabsTrigger>
          <TabsTrigger value="custom" className="h-full rounded-lg text-xs">
            {t("custom")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {preset === "default" ? (
        <div className="divide-y rounded-xl border bg-muted/20 px-3">
          {PHASE_KEYS.map((phase) => (
            <div
              key={phase}
              className="flex min-h-11 items-center justify-between gap-3"
            >
              <span className="text-sm">{configT(`phases.${phase}`)}</span>
              <Badge
                variant="secondary"
                className="h-6 font-mono text-[11px] tabular-nums"
              >
                {formatPhaseDuration(durations[phase])}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {PHASE_KEYS.map((phase) => {
            const hasError = invalidSet.has(phase);

            return (
              <div
                key={phase}
                className="flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-muted/20 pl-3 pr-1"
              >
                <label htmlFor={`timer-${phase}`} className="text-sm">
                  {configT(`phases.${phase}`)}
                </label>
                <InputGroup className="h-11 w-30 border-border/80 bg-background/60">
                  <InputGroupInput
                    id={`timer-${phase}`}
                    type="number"
                    inputMode="numeric"
                    min={MIN_PHASE_SECONDS}
                    max={MAX_PHASE_SECONDS}
                    step={5}
                    value={
                      durations[phase]
                        ? Math.round(durations[phase] / 1000)
                        : ""
                    }
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      onChange(phase, Number(event.target.value) * 1000)
                    }
                    aria-invalid={hasError}
                    className="text-right font-mono tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <InputGroupAddon
                    align="inline-end"
                    className="pointer-events-none pr-2 text-xs"
                  >
                    {t("seconds")}
                  </InputGroupAddon>
                </InputGroup>
              </div>
            );
          })}

          {invalid.length > 0 ? (
            <p className="text-xs text-destructive">
              {t("timerRange", {
                min: MIN_PHASE_SECONDS,
                max: MAX_PHASE_SECONDS,
              })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
