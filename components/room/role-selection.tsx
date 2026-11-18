"use client";

import { Dices, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  FACTION_ROLE_IDS,
  canDisableRole,
  requiresDuplicates,
  type RolePool,
} from "@/game-core/role-selection";
import type { FactionCounts, RoleId } from "@/components/game/types";
import { FACTION_KEYS } from "@/components/game/room-config";
import { ROLES } from "@/components/game/data";
import { FactionBadge } from "@/components/game/faction-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type RoleTab = "default" | "custom";

export function RoleSelection({
  tab,
  onTabChange,
  seats,
  pool,
  onToggle,
  allowDuplicates,
  onAllowDuplicatesChange,
  roleCounts,
  onShuffle,
}: {
  tab: RoleTab;
  onTabChange: (tab: RoleTab) => void;
  seats: FactionCounts;
  pool: RolePool;
  onToggle: (roleId: RoleId, enabled: boolean) => void;
  allowDuplicates: boolean;
  onAllowDuplicatesChange: (enabled: boolean) => void;
  roleCounts: Record<RoleId, number>;
  onShuffle: () => void;
}) {
  const t = useTranslations("CreateRoom");
  const rolesT = useTranslations("Roles");
  const duplicatesRequired = requiresDuplicates(seats, pool);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 rounded-xl border bg-muted/20 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("allowDuplicates")}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {duplicatesRequired
              ? t("duplicatesRequired")
              : t("allowDuplicatesHint")}
          </p>
        </div>
        <Switch
          checked={allowDuplicates || duplicatesRequired}
          disabled={duplicatesRequired}
          onCheckedChange={onAllowDuplicatesChange}
          aria-label={t("allowDuplicates")}
          className="mt-0.5 shrink-0"
        />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as RoleTab)}
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

      {tab === "default" ? (
        <p className="rounded-xl border border-dashed px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          {t("rolesDefaultHint")}
        </p>
      ) : (
        <div className="space-y-4">
          {FACTION_KEYS.map((faction) => (
            <section
              key={faction}
              className="rounded-xl border bg-muted/20 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <FactionBadge faction={faction} />
                <span className="text-[11px] text-muted-foreground">
                  {t("rolesSeats", { count: seats[faction] })}
                </span>
              </div>

              <div className="mt-2 space-y-1">
                {FACTION_ROLE_IDS[faction].map((roleId) => {
                  const isGodfather = roleId === "godfather";
                  const locked =
                    isGodfather ||
                    (pool[roleId] &&
                      !canDisableRole(roleId, seats, pool));

                  return (
                    <label
                      key={roleId}
                      className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg px-1"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {rolesT(`${roleId}.name`)}
                          {isGodfather ? (
                            <Lock
                              className="size-3 text-muted-foreground"
                              aria-label={t("rolesGodfatherLocked")}
                            />
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {rolesT(`${roleId}.short`)}
                        </span>
                      </span>
                      <Switch
                        checked={pool[roleId]}
                        disabled={locked}
                        onCheckedChange={(checked) =>
                          onToggle(roleId, checked)
                        }
                        aria-label={rolesT(`${roleId}.name`)}
                        className="shrink-0"
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {t("rolesPreview")}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onShuffle}
            className="min-h-11 gap-1.5 px-3"
          >
            <Dices className="size-4" />
            {t("rolesShuffle")}
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.entries(roleCounts) as Array<[RoleId, number]>)
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
    </div>
  );
}
