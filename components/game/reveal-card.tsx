"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGame } from "./game-provider";
import { RoleCard } from "./role-card";
import { useHoldReveal } from "./use-hold-reveal";

export function RevealCard() {
  const t = useTranslations("Role");
  const { you } = useGame();
  const { shown, start } = useHoldReveal();

  return (
    <button
      type="button"
      aria-label={t("hold")}
      aria-pressed={shown}
      className="block w-full touch-none select-none rounded-2xl text-left outline-none [perspective:1200px] focus-visible:ring-2 focus-visible:ring-ring"
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
      <div
        className={cn(
          "grid transition-transform duration-500 ease-out [transform-style:preserve-3d]",
          shown && "[transform:rotateY(180deg)]",
        )}
      >
        <div className="[grid-area:1/1] [backface-visibility:hidden]">
          <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card p-6 text-center">
            <div className="grid size-16 place-items-center rounded-2xl border border-dashed">
              <Lock className="size-6 text-muted-foreground" />
            </div>
            <p className="max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
              {t("hint")}
            </p>
          </div>
        </div>

        <div className="[grid-area:1/1] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <RoleCard player={you} />
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {shown ? t("holding") : t("hold")}
      </p>
    </button>
  );
}
