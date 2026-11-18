"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FactionBadge } from "@/components/game/faction-badge";
import { ROLES } from "@/components/game/data";
import {
  FACTION_KEYS,
  formatPhaseDuration,
  PHASE_KEYS,
} from "@/components/game/room-config";
import type { RoleId, RoomConfig } from "@/components/game/types";
import { cn } from "@/lib/utils";

export function RoomConfigSummary({
  config,
  className,
}: {
  config: RoomConfig;
  className?: string;
}) {
  const t = useTranslations("RoomConfig");
  const rolesT = useTranslations("Roles");

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t("title")}</h2>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {t("seats", { count: config.playerCount })}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {FACTION_KEYS.map((faction) => (
          <div
            key={faction}
            className="rounded-lg border bg-muted/20 px-2 py-2.5 text-center"
          >
            <p className="font-mono text-lg font-semibold tabular-nums">
              {config.factionCounts[faction]}
            </p>
            <FactionBadge
              faction={faction}
              className="mt-1 h-5 px-1.5 text-[10px]"
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <Badge variant="outline" className="h-5 text-[10px]">
          {t("factions")}: {t(config.factionPreset)}
        </Badge>
        <Badge variant="outline" className="h-5 text-[10px]">
          {t("timers")}: {t(config.timerPreset)}
        </Badge>
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {t("roles")}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(Object.entries(config.roleCounts) as Array<[RoleId, number]>)
            .filter(([, count]) => count > 0)
            .map(([roleId, count]) => (
              <Badge
                key={roleId}
                variant="secondary"
                className="h-6 gap-1 px-2 text-[11px] font-normal"
              >
                <span className="font-mono font-semibold">{count}×</span>
                {rolesT(`${roleId}.name`)}
                <span
                  className={cn(
                    "ml-0.5 size-1.5 rounded-full",
                    ROLES[roleId].faction === "mafia" && "bg-faction-mafia",
                    ROLES[roleId].faction === "town" && "bg-faction-town",
                    ROLES[roleId].faction === "neutral" &&
                      "bg-faction-neutral",
                  )}
                />
              </Badge>
            ))}
        </div>
      </div>

      <Separator className="my-3" />

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {PHASE_KEYS.map((phase) => (
          <div
            key={phase}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <span className="truncate text-muted-foreground">
              {t(`phases.${phase}`)}
            </span>
            <span className="shrink-0 font-mono tabular-nums">
              {formatPhaseDuration(config.phaseDurations[phase])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
