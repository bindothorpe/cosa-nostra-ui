"use client";

import { useTranslations } from "next-intl";
import { Check, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "../game-provider";
import { ReadyStatus } from "../ready-status";
import { RevealCard } from "../reveal-card";

export function RoleRevealScreen() {
  const t = useTranslations("Role");
  const { markReady, isReady, waitingCount } = useGame();

  return (
    <div className="space-y-5">
      <header className="space-y-2 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full border bg-card">
          <Moon className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
          {t("hint")}
        </p>
      </header>

      <RevealCard />

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-2"
        disabled={isReady}
        onClick={markReady}
      >
        {isReady ? <Check className="size-4" /> : null}
        {t("seen")}
      </Button>

      <ReadyStatus show={isReady} waitingCount={waitingCount} />

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        {t("confirmHint")}
      </p>
    </div>
  );
}
