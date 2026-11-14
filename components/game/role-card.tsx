"use client";

import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { FactionBadge } from "./faction-badge";
import { useGame } from "./game-provider";
import type { Player } from "./types";

export function RoleCard({
  player,
  className,
}: {
  player: Player;
  className?: string;
}) {
  const t = useTranslations("Role");
  const roleT = useTranslations("Roles");
  const { state } = useGame();

  const crew = state.players.filter(
    (member) => member.faction === "mafia" && member.id !== player.id,
  );

  return (
    <div className={cn("rounded-2xl border bg-card p-5", className)}>
      <FactionBadge faction={player.faction} />
      <h2 className="mt-3 text-3xl font-semibold tracking-tight">
        {roleT(`${player.roleId}.name`)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {roleT(`${player.roleId}.short`)}
      </p>

      <Separator className="my-4" />

      <div className="space-y-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("ability")}
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            {roleT(`${player.roleId}.ability`)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("win")}
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            {roleT(`${player.roleId}.win`)}
          </p>
        </div>
      </div>

      {player.faction === "mafia" && crew.length > 0 ? (
        <>
          <Separator className="my-4" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("crew")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("crewHint")}
            </p>
            <ul className="mt-2 space-y-1.5">
              {crew.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-medium">{member.name}</span>
                  <span className="text-muted-foreground">
                    {roleT(`${member.roleId}.name`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
