"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { useGame } from "./game-provider";

export function ActionScreen({
  phase,
  title,
  children,
}: {
  phase: "night" | "day";
  title: string;
  children: ReactNode;
}) {
  const phaseT = useTranslations("Phase");
  const { state } = useGame();
  const Icon = phase === "night" ? Moon : Sun;
  const phaseLabel =
    phase === "night"
      ? phaseT("night", { round: state.round })
      : phaseT("dayDiscussion", { round: state.round });

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3" />
          {phaseLabel}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </header>

      {children}
    </div>
  );
}
