"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sunrise } from "lucide-react";
import { AlertItem } from "../alert-item";
import { useGame } from "../game-provider";

const NEXT_PHASE_SECONDS = 5;

export function NightReportScreen() {
  const t = useTranslations("NightReport");
  const phaseT = useTranslations("Phase");
  const { state, beginDay } = useGame();
  const [seconds, setSeconds] = useState(NEXT_PHASE_SECONDS);

  useEffect(() => {
    if (seconds <= 0) {
      beginDay();
      return;
    }

    const timeout = window.setTimeout(
      () => setSeconds((current) => current - 1),
      1000,
    );

    return () => window.clearTimeout(timeout);
  }, [seconds, beginDay]);

  const report = state.alerts.slice(0, 3);

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Sunrise className="size-3" />
          {phaseT("nightReport", { round: state.round })}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {report.length > 0 ? (
        <div className="space-y-2">
          {report.map((alert) => (
            <AlertItem key={alert.id} alert={alert} showUnread={false} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {t("quiet")}
        </p>
      )}

      <div
        className="rounded-xl border bg-card p-4 text-center"
        aria-live="polite"
      >
        <p className="text-sm font-medium">
          {t("startingIn", { seconds })}
        </p>
        <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">
          {seconds}
        </p>
      </div>
    </div>
  );
}
