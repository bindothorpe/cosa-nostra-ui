"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Faction } from "./types";

const FACTION_STYLES: Record<Faction, string> = {
  mafia: "bg-faction-mafia/15 text-faction-mafia",
  town: "bg-faction-town/15 text-faction-town",
  neutral: "bg-faction-neutral/15 text-faction-neutral",
};

export function FactionBadge({
  faction,
  className,
}: {
  faction: Faction;
  className?: string;
}) {
  const t = useTranslations("Faction");

  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", FACTION_STYLES[faction], className)}
    >
      {t(faction)}
    </Badge>
  );
}
