"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FactionBadge } from "@/components/game/faction-badge";
import {
  FACTION_KEYS,
  factionTotal,
  type FactionError,
} from "@/components/game/room-config";
import type { FactionCounts, RoomPreset } from "@/components/game/types";
import { cn } from "@/lib/utils";
import { NumberStepper } from "./number-stepper";

export function FactionDistribution({
  preset,
  onPresetChange,
  playerCount,
  counts,
  onCountsChange,
  errors,
}: {
  preset: RoomPreset;
  onPresetChange: (preset: RoomPreset) => void;
  playerCount: number;
  counts: FactionCounts;
  onCountsChange: (counts: FactionCounts) => void;
  errors: FactionError[];
}) {
  const t = useTranslations("CreateRoom");
  const factionT = useTranslations("Faction");
  const total = factionTotal(counts);

  function updateFaction(faction: keyof FactionCounts, next: number) {
    onCountsChange({ ...counts, [faction]: next });
  }

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
        <div className="grid grid-cols-3 gap-2">
          {FACTION_KEYS.map((faction) => (
            <div
              key={faction}
              className="rounded-xl border bg-muted/20 px-2 py-3 text-center"
            >
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {counts[faction]}
              </p>
              <FactionBadge
                faction={faction}
                className="mt-1.5 h-5 px-1.5 text-[10px]"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {FACTION_KEYS.map((faction) => (
            <div
              key={faction}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-muted/20 pl-3 pr-1"
            >
              <FactionBadge faction={faction} />
              <NumberStepper
                value={counts[faction]}
                min={0}
                max={faction === "neutral" ? 2 : playerCount}
                onChange={(value) => updateFaction(faction, value)}
                decreaseLabel={t("decreaseFaction", {
                  faction: factionT(faction),
                })}
                increaseLabel={t("increaseFaction", {
                  faction: factionT(faction),
                })}
                valueClassName="min-w-9 text-lg"
              />
            </div>
          ))}

          <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-xs">
            <span className="text-muted-foreground">{t("total")}</span>
            <span
              className={cn(
                "font-mono font-semibold tabular-nums",
                total === playerCount ? "text-foreground" : "text-destructive",
              )}
            >
              {total} / {playerCount}
            </span>
          </div>
        </div>
      )}

      <p className="rounded-xl border border-dashed px-3 py-3 text-xs leading-relaxed text-muted-foreground">
        {t("rolesMovedHint")}
      </p>

      {errors.length > 0 ? (
        <ul className="space-y-1 text-xs text-destructive">
          {errors.map((error) => (
            <li key={error}>{t(`errors.${error}`, { count: playerCount })}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
