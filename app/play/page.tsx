"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/game/app-shell";
import { useGame } from "@/components/game/game-provider";
import { DayScreen } from "@/components/game/screens/day-screen";
import { GameOverScreen } from "@/components/game/screens/game-over-screen";
import { NightActionScreen } from "@/components/game/screens/night-action-screen";
import { NightReportScreen } from "@/components/game/screens/night-report-screen";
import { RoleRevealScreen } from "@/components/game/screens/role-reveal-screen";
import { VoteResultScreen } from "@/components/game/screens/vote-result-screen";
import { VotingScreen } from "@/components/game/screens/voting-screen";

function PlayContent() {
  const t = useTranslations("Lobby");
  const { state } = useGame();

  switch (state.phase) {
    case "roleReveal":
      return <RoleRevealScreen />;
    case "night":
      return <NightActionScreen />;
    case "nightReport":
      return <NightReportScreen />;
    case "dayDiscussion":
      return <DayScreen />;
    case "voting":
      return <VotingScreen />;
    case "voteResult":
      return <VoteResultScreen />;
    case "gameOver":
      return <GameOverScreen />;
    default:
      return (
        <div className="flex min-h-[60dvh] items-center">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>{t("title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
              <Link
                href="/lobby"
                className={buttonVariants({ className: "h-11 w-full" })}
              >
                {t("start")}
              </Link>
            </CardContent>
          </Card>
        </div>
      );
  }
}

export default function PlayPage() {
  return (
    <AppShell>
      <PlayContent />
    </AppShell>
  );
}
