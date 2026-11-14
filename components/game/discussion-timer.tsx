"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const TOTAL_SECONDS = 5 * 60;

export function DiscussionTimer() {
  const t = useTranslations("Day");
  const [seconds, setSeconds] = useState(TOTAL_SECONDS);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const label = `${minutes}:${String(remainder).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          {t("timer")}
        </span>
        <span className="font-mono text-lg font-semibold tabular-nums">
          {label}
        </span>
      </div>
      <Progress
        value={(seconds / TOTAL_SECONDS) * 100}
        className="mt-3 h-1.5"
      />
    </div>
  );
}
