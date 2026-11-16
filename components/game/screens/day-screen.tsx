"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, MessageSquare, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "../game-provider";
import { PlayerAvatar } from "../player-avatar";
import { ReadyStatus } from "../ready-status";

export function DayScreen() {
  const t = useTranslations("Day");
  const whisperT = useTranslations("Whispers");
  const phaseT = useTranslations("Phase");
  const common = useTranslations("Common");
  const { state, markReady, isReady, waitingCount } = useGame();

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Sun className="size-3" />
          {phaseT("dayDiscussion", { round: state.round })}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>

      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{t("aliveList")}</span>
        <span className="text-xs text-muted-foreground">
          {t("alive", { count: state.players.filter((p) => p.alive).length })}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-x-2 gap-y-4">
        {state.players.map((player) => (
          <div
            key={player.id}
            className="flex flex-col items-center gap-1.5 text-center"
          >
            <PlayerAvatar
              player={player}
              className="size-11"
              dimmed={!player.alive}
            />
            <span
              className={
                player.alive
                  ? "w-full truncate text-xs font-medium"
                  : "w-full truncate text-xs font-medium text-muted-foreground line-through"
              }
            >
              {player.name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {player.isYou ? common("you") : player.alive ? "" : common("dead")}
            </span>
          </div>
        ))}
      </div>

      <Link
        href="/whispers"
        className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-faction-town/15 text-faction-town">
          <MessageSquare className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("whisperCta")}</span>
          <span className="block text-xs text-muted-foreground">
            {t("whisperHint")} ·{" "}
            {whisperT("remaining", { count: state.whispersLeft })}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>

      <Button
        type="button"
        className="h-12 w-full gap-2"
        disabled={isReady}
        onClick={markReady}
      >
        {isReady ? <Check className="size-4" /> : null}
        {t("startVote")}
      </Button>
      <ReadyStatus show={isReady} waitingCount={waitingCount} />
    </div>
  );
}
