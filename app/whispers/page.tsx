"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight, Skull } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/game/app-shell";
import { useGame } from "@/components/game/game-provider";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { cn } from "@/lib/utils";

function WhispersContent() {
  const t = useTranslations("Whispers");
  const graveT = useTranslations("Graveyard");
  const common = useTranslations("Common");
  const { state, you } = useGame();

  const rows = state.players
    .filter((player) => !player.isYou)
    .map((player) => {
      const thread = state.whispers.find(
        (item) => item.playerId === player.id,
      );
      const last = thread?.messages[thread.messages.length - 1];
      const body = last
        ? (last.text ?? (last.textKey ? t(last.textKey) : ""))
        : t("startChat");
      const preview = last?.from === "you" ? `${common("you")}: ${body}` : body;

      return { player, thread, preview };
    })
    .sort(
      (a, b) =>
        (b.thread?.unread ?? 0) - (a.thread?.unread ?? 0) ||
        Number(Boolean(b.thread?.messages.length)) -
          Number(Boolean(a.thread?.messages.length)),
    );

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {you.alive
              ? t("remaining", { count: state.whispersLeft })
              : common("dead")}
          </Badge>
        </div>
      </header>

      {!you.alive ? (
        <Link
          href="/graveyard"
          className="flex min-h-16 items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3 transition-colors hover:bg-primary/[0.07]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <Skull className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {graveT("title")}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {graveT("pinned")}
              </span>
              {state.graveyardUnread > 0 ? (
                <span className="grid min-w-4 shrink-0 place-items-center rounded-full bg-faction-mafia px-1 text-[9px] font-semibold leading-4 text-white">
                  {state.graveyardUnread}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {graveT("subtitle")}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ) : null}

      <div className="space-y-2">
        {rows.map(({ player, thread, preview }) => (
          <Link
            key={player.id}
            href={`/whispers/${player.id}`}
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40",
              !player.alive && "opacity-60",
            )}
          >
            <PlayerAvatar player={player} dimmed={!player.alive} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {player.name}
                </span>
                {!player.alive ? (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {common("dead")}
                  </span>
                ) : null}
                {thread && thread.unread > 0 ? (
                  <span className="grid min-w-4 shrink-0 place-items-center rounded-full bg-faction-mafia px-1 text-[9px] font-semibold leading-4 text-white">
                    {thread.unread}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {preview}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {state.whispersLeft <= 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          {t("limitReached")}
        </p>
      ) : null}
    </div>
  );
}

export default function WhispersPage() {
  return (
    <AppShell>
      <WhispersContent />
    </AppShell>
  );
}
