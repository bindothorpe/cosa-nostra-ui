"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "../game-provider";
import { PlayerGrid } from "../player-grid";
import { ReadyStatus } from "../ready-status";

export function VotingScreen() {
  const t = useTranslations("Vote");
  const phaseT = useTranslations("Phase");
  const {
    state,
    you,
    alivePlayers,
    castVote,
    isReady,
    waitingCount,
  } = useGame();
  const [selected, setSelected] = useState<string | null>(null);

  const selectedName = alivePlayers.find(
    (player) => player.id === selected,
  )?.name;

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Vote className="size-3" />
          {phaseT("voting", { round: state.round })}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>

      <PlayerGrid
        players={alivePlayers}
        selectedId={selected}
        onSelect={setSelected}
        excludeId={you.id}
        disabled={isReady}
      />

      <p className="text-center text-xs text-muted-foreground">{t("hint")}</p>

      <Button
        type="button"
        className="h-12 w-full gap-2"
        disabled={!selected || isReady}
        onClick={() => {
          if (selected) castVote(selected);
        }}
      >
        {isReady ? <Check className="size-4" /> : null}
        {selectedName
          ? t("confirmTarget", { name: selectedName })
          : t("confirm")}
      </Button>
      <ReadyStatus show={isReady} waitingCount={waitingCount} />
    </div>
  );
}
