"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FactionBadge } from "../faction-badge";
import { useGame } from "../game-provider";
import { PlayerAvatar } from "../player-avatar";

export function GameOverScreen() {
  const t = useTranslations("GameOver");
  const roleT = useTranslations("Roles");
  const factionT = useTranslations("Faction");
  const router = useRouter();
  const { state, resetGame } = useGame();

  const winner = state.winnerFaction ?? "mafia";

  return (
    <div className="space-y-5">
      <header className="space-y-2 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("title")}
        </p>
        <FactionBadge faction={winner} className="mx-auto" />
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("winner", { faction: factionT(winner) })}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">{t("reveal")}</h2>
        {state.players.map((player) => (
          <div
            key={player.id}
            className="flex items-center gap-3 rounded-xl border bg-card p-3"
          >
            <PlayerAvatar
              player={player}
              className="size-9"
              dimmed={!player.alive}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{player.name}</p>
              <p className="text-xs text-muted-foreground">
                {roleT(`${player.roleId}.name`)}
              </p>
            </div>
            <FactionBadge faction={player.faction} />
          </div>
        ))}
      </div>

      <Button
        type="button"
        className="h-12 w-full gap-2"
        onClick={() => {
          resetGame();
          router.push("/lobby");
        }}
      >
        <RotateCcw className="size-4" />
        {t("again")}
      </Button>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        {t("mockNote")}
      </p>
    </div>
  );
}
