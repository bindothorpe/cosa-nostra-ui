"use client";

import { useTranslations } from "next-intl";
import {
  Lock,
  Moon,
  Search,
  Skull,
  Trophy,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertKind, GameAlert } from "./types";

const ICONS: Record<AlertKind, LucideIcon> = {
  kill: Skull,
  blocked: Lock,
  investigation: Search,
  system: Moon,
  vote: Vote,
  win: Trophy,
};

const STYLES: Record<AlertKind, string> = {
  kill: "bg-faction-mafia/15 text-faction-mafia",
  blocked: "bg-faction-neutral/15 text-faction-neutral",
  investigation: "bg-faction-town/15 text-faction-town",
  system: "bg-muted text-muted-foreground",
  vote: "bg-violet-500/15 text-violet-300",
  win: "bg-emerald-500/15 text-emerald-300",
};

export function AlertItem({
  alert,
  showUnread = true,
}: {
  alert: GameAlert;
  showUnread?: boolean;
}) {
  const t = useTranslations();
  const Icon = ICONS[alert.kind];

  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border bg-card p-3",
        showUnread && !alert.read && "border-primary/30 bg-primary/[0.04]",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          STYLES[alert.kind],
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug">
            {t(alert.titleKey, alert.params)}
          </p>
          {showUnread && !alert.read ? (
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
          ) : null}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {t(alert.detailKey, alert.params)}
        </p>
      </div>
    </div>
  );
}
