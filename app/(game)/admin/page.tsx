"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGame } from "@/components/game/game-provider";
import { usePhaseLabel } from "@/components/game/use-phase-label";

const ADVANCEABLE_PHASES = [
  "roleReveal",
  "night",
  "nightReport",
  "dayDiscussion",
  "voting",
  "voteResult",
];

function AdminContent() {
  const t = useTranslations("Admin");
  const common = useTranslations("Common");
  const { state, advancePhase, you, killSelf, status } = useGame();
  const live = status !== undefined;
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

      {live ? (
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          {t("liveNote")}
        </p>
      ) : (
        <>
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

          <div className="space-y-3 border-t pt-5">
            {you.alive ? (
              <>
                <p className="text-center text-xs text-muted-foreground">
                  {t("killMeHint")}
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11 w-full"
                  onClick={killSelf}
                >
                  {t("killMe")}
                </Button>
              </>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">{t("dead")}</p>
                <Link
                  href="/graveyard"
                  className={buttonVariants({
                    variant: "outline",
                    className: "h-11 w-full",
                  })}
                >
                  {t("openGraveyard")}
                </Link>
              </div>
            )}
          </div>
        </>
      )}

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        {t("mockNote")}
      </p>
    </div>
  );
}

export default function AdminPage() {
  return <AdminContent />;
}
