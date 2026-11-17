"use client";

import { useTranslations } from "next-intl";
import { Sunrise } from "lucide-react";
import { AlertItem } from "../alert-item";
import { useGame } from "../game-provider";

export function NightReportScreen() {
  const t = useTranslations("NightReport");
  const phaseT = useTranslations("Phase");
  const { state } = useGame();

  const report = state.alerts
    .filter((alert) => alert.night === state.round)
    .slice(-3)
    .reverse();

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
    </div>
  );
}
