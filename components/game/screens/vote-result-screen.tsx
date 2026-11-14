"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FactionBadge } from "../faction-badge";
import { useGame } from "../game-provider";
import { PlayerAvatar } from "../player-avatar";

export function VoteResultScreen() {
  const t = useTranslations("Vote");
  const roleT = useTranslations("Roles");
  const factionT = useTranslations("Faction");
  const { state, getPlayer, finishGame } = useGame();

  const eliminated = state.eliminatedId
    ? getPlayer(state.eliminatedId)
    : undefined;

  const tally = Object.entries(state.voteTally ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const max = tally[0]?.[1] ?? 1;

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("resultTitle")}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          {eliminated
            ? t("eliminated", { name: eliminated.name })
            : t("noElimination")}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {eliminated
            ? t("wasRole", {
                role: roleT(`${eliminated.roleId}.name`),
                faction: factionT(eliminated.faction),
              })
            : t("tie")}
        </p>
      </header>

      {eliminated ? (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <PlayerAvatar player={eliminated} className="size-12" dimmed />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{eliminated.name}</p>
            <p className="text-xs text-muted-foreground">
              {roleT(`${eliminated.roleId}.name`)}
            </p>
          </div>
          <FactionBadge faction={eliminated.faction} />
        </div>
      ) : null}

      <div className="space-y-3">
        {tally.map(([id, count]) => {
          const player = getPlayer(id);
          if (!player) return null;
          const isOut = id === state.eliminatedId;

          return (
            <div key={id}>
              <div className="flex items-center justify-between text-sm">
                <span
                  className={cn(
                    "font-medium",
                    isOut && "text-faction-mafia",
                  )}
                >
                  {player.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("tally", { count })}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    isOut ? "bg-faction-mafia" : "bg-foreground/30",
                  )}
                  style={{ width: `${Math.max(6, (count / max) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <Button type="button" className="h-12 w-full" onClick={finishGame}>
        {t("finish")}
      </Button>
    </div>
  );
}
