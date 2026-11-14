"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGame } from "./game-provider";
import { PlayerGrid } from "./player-grid";

export function ActionPanel({
  onConfirmed,
}: {
  onConfirmed?: () => void;
}) {
  const t = useTranslations();
  const { state, you, yourRole, alivePlayers, submitAction } = useGame();
  const [selected, setSelected] = useState<string | null>(null);

  const isNight = state.phase === "night";
  const hasAction = yourRole.abilityPhase === (isNight ? "night" : "day");
  const phaseWord = isNight ? t("Common.night") : t("Common.day");

  if (!hasAction) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium">
            {t("Action.noAction", { phase: phaseWord })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {yourRole.abilityPhase === "passive"
              ? t("Action.passiveBody")
              : t("Action.noActionBody")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedName = alivePlayers.find(
    (player) => player.id === selected,
  )?.name;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("Role.ability")}
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            {t(`Roles.${you.roleId}.ability`)}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("Action.chooseTarget")}</p>
        <PlayerGrid
          players={alivePlayers}
          selectedId={selected}
          onSelect={setSelected}
          excludeId={you.id}
        />
      </div>

      <Button
        type="button"
        className="h-12 w-full"
        disabled={!selected}
        onClick={() => {
          if (!selected) return;
          submitAction(selected);
          onConfirmed?.();
        }}
      >
        {selectedName
          ? t("Action.selected", { name: selectedName })
          : t("Action.confirm")}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {t("Action.remaining", { phase: phaseWord })}
      </p>
    </div>
  );
}
