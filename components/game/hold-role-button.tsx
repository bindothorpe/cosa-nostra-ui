"use client";

import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "./game-provider";
import { RoleCard } from "./role-card";
import { useHoldReveal } from "./use-hold-reveal";

export function HoldRoleButton() {
  const t = useTranslations();
  const { you } = useGame();
  const { shown, start } = useHoldReveal();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t("Role.peek")}
        className="size-11 touch-none select-none"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          event.preventDefault();
          start();
        }}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            start();
          }
        }}
      >
        <Eye className="size-5" />
      </Button>

      {shown
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t("Role.title")}
              className="fixed inset-0 z-[60] flex touch-none select-none flex-col items-center justify-center gap-4 overflow-y-auto bg-background/95 p-6 backdrop-blur-md"
            >
              <div className="my-auto w-full max-w-sm space-y-3 py-4">
                <p className="text-center text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {t("Role.title")}
                </p>
                <RoleCard player={you} className="shadow-2xl" />
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">
                {t("Role.holding")}
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
