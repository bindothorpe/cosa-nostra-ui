"use client";

import { useTranslations } from "next-intl";
import { Moon } from "lucide-react";
import { useGame } from "../game-provider";
import { ActionPanel } from "../action-panel";

export function NightActionScreen() {
  const t = useTranslations("Action");
  const phaseT = useTranslations("Phase");
  const { state } = useGame();

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Moon className="size-3" />
          {phaseT("night", { round: state.round })}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("nightTitle")}
        </h1>
      </header>

      <ActionPanel />
    </div>
  );
}
