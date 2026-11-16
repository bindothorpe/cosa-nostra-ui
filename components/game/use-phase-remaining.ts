"use client";

import { useEffect, useState } from "react";
import { useGame } from "./game-provider";
import type { ConfigurablePhase } from "./types";

export function usePhaseRemaining() {
  const { state } = useGame();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.phaseEndsAt === null) return;

    const interval = window.setInterval(() => setNow(Date.now()), 250);

    return () => window.clearInterval(interval);
  }, [state.phaseEndsAt]);

  if (state.phaseEndsAt === null) {
    return { seconds: 0, total: 0, progress: 0 };
  }

  const total =
    (state.roomConfig.phaseDurations[state.phase as ConfigurablePhase] ?? 0) /
    1000;
  const remaining = Math.min(
    Math.max(0, (state.phaseEndsAt - now) / 1000),
    total,
  );

  return {
    seconds: Math.ceil(remaining),
    total,
    progress: total > 0 ? remaining / total : 0,
  };
}
