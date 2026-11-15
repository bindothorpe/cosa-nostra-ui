"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGame } from "./game-provider";
import { RoleCard } from "./role-card";

export function RevealCard() {
  const t = useTranslations("Role");
  const { you } = useGame();
  const [open, setOpen] = useState(false);

  return (
    <div className="[perspective:1200px]">
      <div
        className={cn(
          "grid transition-transform duration-500 ease-out [transform-style:preserve-3d]",
          open && "[transform:rotateY(180deg)]",
        )}
      >
        <div
          aria-hidden={open}
          inert={open}
          className="[grid-area:1/1] [backface-visibility:hidden]"
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("tap")}
            className="flex h-full min-h-72 w-full touch-pan-y select-none flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card p-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="grid size-16 place-items-center rounded-2xl border border-dashed">
              <Lock className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{t("tap")}</p>
            <p className="max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
              {t("hint")}
            </p>
          </button>
        </div>

        <div
          aria-hidden={!open}
          inert={!open}
          onClick={() => setOpen(false)}
          className="[grid-area:1/1] [backface-visibility:hidden] [transform:rotateY(180deg)]"
        >
          <RoleCard player={you} />
        </div>
      </div>
    </div>
  );
}
