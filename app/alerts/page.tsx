"use client";

import { useTranslations } from "next-intl";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/game/app-shell";
import { AlertItem } from "@/components/game/alert-item";
import { useGame } from "@/components/game/game-provider";

function AlertsContent() {
  const t = useTranslations("Alerts");
  const { state, unreadAlerts, markAllAlertsRead } = useGame();

  const latest = state.alerts.filter((alert) => !alert.read);
  const earlier = state.alerts.filter((alert) => alert.read);

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          {unreadAlerts > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 shrink-0 gap-1.5 px-2 text-xs"
              onClick={markAllAlertsRead}
            >
              <CheckCheck className="size-4" />
              {t("markRead")}
            </Button>
          ) : null}
        </div>
      </header>

      {latest.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("tonight")}</h2>
          {latest.map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
        </section>
      ) : null}

      {earlier.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("earlier")}</h2>
          {earlier.map((alert) => (
            <AlertItem key={alert.id} alert={alert} showUnread={false} />
          ))}
        </section>
      ) : null}

      {state.alerts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : null}
    </div>
  );
}

export default function AlertsPage() {
  return (
    <AppShell>
      <AlertsContent />
    </AppShell>
  );
}
