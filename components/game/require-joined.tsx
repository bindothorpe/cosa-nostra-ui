"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "./game-provider";

export function RedirectScreen() {
  return <div aria-hidden className="min-h-dvh" />;
}

export function RequireJoined({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { state } = useGame();

  useEffect(() => {
    if (!state.joined) {
      router.replace("/");
    }
  }, [router, state.joined]);

  if (!state.joined) {
    return <RedirectScreen />;
  }

  return <>{children}</>;
}
