"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Skull } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGame } from "../game-provider";
import { PlayerAvatar } from "../player-avatar";
import { usePhaseLabel } from "../use-phase-label";

export function SpectatorScreen() {
  const t = useTranslations("Spectator");
  const common = useTranslations("Common");
  const { state, you } = useGame();
  const phaseLabel = usePhaseLabel(state.phase, state.round);

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Skull className="size-3" />
          {phaseLabel}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            <PlayerAvatar player={you} dimmed />
            <div className="min-w-0">
              <p className="text-sm font-medium">{you.name}</p>
              <p className="text-xs text-muted-foreground">{t("deadNote")}</p>
            </div>
          </div>
          <Link
            href="/graveyard"
            className={buttonVariants({ className: "h-11 w-full gap-2" })}
          >
            <Skull className="size-4" />
            {t("graveyard")}
          </Link>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("roster")}</h2>
        <div className="grid grid-cols-2 gap-2">
          {state.players
            .filter((player) => player.alive)
            .map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-2.5 rounded-xl border bg-card p-2.5"
              >
                <PlayerAvatar player={player} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {player.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {player.isYou ? common("you") : ""}
                  </span>
                </span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
