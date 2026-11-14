"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Drama } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BottomNav } from "./bottom-nav";
import { useGame } from "./game-provider";
import { HoldRoleButton } from "./hold-role-button";
import { LocaleSwitcher } from "./locale-switcher";
import { usePhaseLabel } from "./use-phase-label";

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const { state } = useGame();
  const phaseLabel = usePhaseLabel(state.phase, state.round);

  if (!state.joined) {
    return (
      <div className="flex min-h-dvh flex-col px-4 pb-8 pt-6">
        <div className="flex justify-end">
          <LocaleSwitcher />
        </div>
        <div className="flex flex-1 items-center">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>{t("Lobby.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("Join.subtitle")}
              </p>
              <Link
                href="/"
                className={buttonVariants({ className: "h-11 w-full" })}
              >
                {t("Lobby.joinFirst")}
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="flex h-16 items-center justify-between gap-2 px-4">
          <Link
            href="/play"
            aria-label={`${t("Common.appName")} — ${phaseLabel}`}
            className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <Drama className="size-4" />
            </span>
            <span className="hidden min-w-0 min-[360px]:block">
              <span className="block truncate text-sm font-semibold leading-tight">
                {t("Common.appName")}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {phaseLabel}
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1.5">
            <LocaleSwitcher />
            <HoldRoleButton />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      <BottomNav />
    </div>
  );
}
