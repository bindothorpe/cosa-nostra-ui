"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Drama } from "lucide-react";
import { BottomNav } from "./bottom-nav";
import { useGame } from "./game-provider";
import { RequireJoined } from "./require-joined";
import { RolePeekButton } from "./role-peek-button";
import { LocaleSwitcher } from "./locale-switcher";
import { PhaseTimer } from "./phase-timer";
import { usePhaseLabel } from "./use-phase-label";

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const { state } = useGame();
  const phaseLabel = usePhaseLabel(state.phase, state.round);

  return (
    <RequireJoined>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="flex h-16 items-center justify-between gap-2 px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Link
                href="/play"
                aria-label={t("Common.appName")}
                className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Drama className="size-4" />
              </Link>
              <PhaseTimer phaseLabel={phaseLabel} />
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <LocaleSwitcher />
              <RolePeekButton />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

        <BottomNav />
      </div>
    </RequireJoined>
  );
}
