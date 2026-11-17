"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "./game-provider";

export function RedirectScreen() {
  return <div aria-hidden className="min-h-dvh" />;
}

export function RequireJoined({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { state, ready } = useGame();

  useEffect(() => {
    if (ready && !state.joined) {
      router.replace("/");
    }
  }, [router, ready, state.joined]);

  if (!ready || !state.joined) {
    return <RedirectScreen />;
  }

  return <>{children}</>;
}
