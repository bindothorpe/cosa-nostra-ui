"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertItem } from "@/components/game/alert-item";
import { useGame } from "@/components/game/game-provider";

function AlertsContent() {
  const t = useTranslations("Alerts");
  const { state, markAllAlertsRead } = useGame();

  useEffect(() => {
    markAllAlertsRead();
  }, [markAllAlertsRead, state.alerts.length]);

  const alerts = [...state.alerts].sort((first, second) => second.at - first.at);

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {alerts.length > 0 ? (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} showUnread={false} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      )}
    </div>
  );
}

export default function AlertsPage() {
  return <AlertsContent />;
}
