"use client";

import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { usePhaseRemaining } from "./use-phase-remaining";

function formatTime(seconds: number) {
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : `${seconds}s`;
}

export function PhaseTimer({ phaseLabel }: { phaseLabel: string }) {
  const t = useTranslations("Common");
  const { seconds, total, progress } = usePhaseRemaining();
  const time = formatTime(seconds);
  const urgent = total > 0 && seconds <= 10;

  return (
    <div
      role="timer"
      data-phase-timer
      className="flex min-w-0 flex-1 flex-col justify-center gap-1.5"
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-medium leading-none">
          {phaseLabel}
        </span>
        {total > 0 ? (
          <span
            aria-label={t("timeLeft", { time })}
            className={cn(
              "shrink-0 font-mono text-[11px] tabular-nums leading-none",
              urgent && "text-faction-mafia",
            )}
          >
            {time}
          </span>
        ) : null}
      </div>

      {total > 0 ? (
        <Progress
          value={progress * 100}
          aria-label={t("timeLeft", { time })}
          className={cn(
            "gap-0 [&_[data-slot=progress-track]]:h-1.5",
            urgent && "[&_[data-slot=progress-indicator]]:bg-faction-mafia",
          )}
        />
      ) : null}
    </div>
  );
}
