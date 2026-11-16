"use client";

import { useTranslations } from "next-intl";

export function ReadyStatus({
  show,
  waitingCount,
}: {
  show: boolean;
  waitingCount: number;
}) {
  const t = useTranslations("Common");

  if (!show) return null;

  return (
    <p
      data-ready-status
      aria-live="polite"
      className="text-center text-xs leading-relaxed text-muted-foreground"
    >
      {waitingCount > 0
        ? t("waitingFor", { count: waitingCount })
        : t("allReady")}
    </p>
  );
}
