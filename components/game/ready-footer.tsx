"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useGame } from "./game-provider";
import { ReadyStatus } from "./ready-status";

export function ReadyFooter() {
  const t = useTranslations("Common");
  const { markReady, isReady, waitingCount, you } = useGame();

  if (!you.alive) return null;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="h-12 w-full gap-2"
        disabled={isReady}
        onClick={markReady}
      >
        {isReady ? <Check className="size-4" /> : null}
        {t("ready")}
      </Button>
      <ReadyStatus show={isReady} waitingCount={waitingCount} />
    </div>
  );
}
