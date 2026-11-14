"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "./player-avatar";
import type { Player } from "./types";

export function PlayerGrid({
  players,
  selectedId,
  onSelect,
  disabled,
  showDead = false,
  excludeId,
}: {
  players: Player[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
  showDead?: boolean;
  excludeId?: string;
}) {
  const t = useTranslations("Common");

  const visible = players.filter(
    (player) => player.id !== excludeId && (showDead || player.alive),
  );

  return (
    <div className="grid grid-cols-2 gap-2">
      {visible.map((player) => {
        const selected = player.id === selectedId;
        return (
          <button
            key={player.id}
            type="button"
            disabled={disabled || !player.alive}
            onClick={() => onSelect(player.id)}
            aria-pressed={selected}
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected && "border-primary bg-primary/5",
              !player.alive && "opacity-50",
            )}
          >
            <PlayerAvatar player={player} dimmed={!player.alive} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {player.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {player.isYou ? t("you") : player.alive ? "" : t("dead")}
              </span>
            </span>
            {selected ? <Check className="size-4 shrink-0" /> : null}
          </button>
        );
      })}
    </div>
  );
}
