"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Drama } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomNav } from "./bottom-nav";
import { useGame } from "./game-provider";
import { RequireJoined } from "./require-joined";
import { RolePeekButton } from "./role-peek-button";
import { LocaleSwitcher } from "./locale-switcher";
import { PhaseTimer } from "./phase-timer";
import { ConnectionBanner } from "./connection-banner";
import { usePhaseLabel } from "./use-phase-label";

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const { state } = useGame();
  const phaseLabel = usePhaseLabel(state.phase, state.round);
  // Chat threads manage their own viewport-height column: messages scroll
  // internally and the composer sits directly above the bottom nav.
  const isChatThread = /^\/whispers\/[^/]+\/?$/.test(pathname);

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

        <main
          className={cn(
            "px-4",
            isChatThread
              ? "flex min-h-0 flex-1 flex-col pt-3 pb-0"
              : "flex-1 pt-4 pb-28",
          )}
        >
          <ConnectionBanner />
          {children}
        </main>

        <BottomNav />
      </div>
    </RequireJoined>
  );
}
