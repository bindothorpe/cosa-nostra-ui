"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/game/app-shell";
import { useGame } from "@/components/game/game-provider";
import { usePhaseLabel } from "@/components/game/use-phase-label";

const ADVANCEABLE_PHASES = [
  "roleReveal",
  "night",
  "nightReport",
  "dayDiscussion",
  "voteResult",
];

function AdminContent() {
  const t = useTranslations("Admin");
  const common = useTranslations("Common");
  const { state, advancePhase } = useGame();
  const phaseLabel = usePhaseLabel(state.phase, state.round);
  const canAdvance = ADVANCEABLE_PHASES.includes(state.phase);

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {common("host")}
        </Badge>
      </header>

      <Card>
        <CardContent className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("phase")}
          </p>
          <p className="mt-1 text-lg font-medium">{phaseLabel}</p>
        </CardContent>
      </Card>

      <Button
        type="button"
        className="h-12 w-full"
        onClick={advancePhase}
        disabled={!canAdvance}
      >
        {t("skip")}
      </Button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {canAdvance ? t("skipHint") : t("unavailable")}
      </p>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        {t("mockNote")}
      </p>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AppShell>
      <AdminContent />
    </AppShell>
  );
}
