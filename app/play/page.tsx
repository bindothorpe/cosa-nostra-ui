"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/game/app-shell";
import { useGame } from "@/components/game/game-provider";
import { RedirectScreen } from "@/components/game/require-joined";
import { DayScreen } from "@/components/game/screens/day-screen";
import { GameOverScreen } from "@/components/game/screens/game-over-screen";
import { NightActionScreen } from "@/components/game/screens/night-action-screen";
import { NightReportScreen } from "@/components/game/screens/night-report-screen";
import { RoleRevealScreen } from "@/components/game/screens/role-reveal-screen";
import { SpectatorScreen } from "@/components/game/screens/spectator-screen";
import { VoteResultScreen } from "@/components/game/screens/vote-result-screen";
import { VotingScreen } from "@/components/game/screens/voting-screen";

function PlayContent() {
  const router = useRouter();
  const { state, you } = useGame();

  useEffect(() => {
    if (state.joined && state.phase === "lobby") {
      router.replace("/lobby");
    }
  }, [router, state.joined, state.phase]);

  if (state.phase === "lobby") {
    return <RedirectScreen />;
  }

  const deadSpectator =
    !you.alive &&
    !["gameOver", "nightReport", "voteResult"].includes(state.phase);

  if (deadSpectator) {
    return <SpectatorScreen />;
  }

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
      return <RedirectScreen />;
  }
}

export default function PlayPage() {
  return (
    <AppShell>
      <PlayContent />
    </AppShell>
  );
}
