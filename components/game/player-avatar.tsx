import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Player } from "./types";

export function PlayerAvatar({
  player,
  className,
  dimmed,
}: {
  player: Player;
  className?: string;
  dimmed?: boolean;
}) {
  const initials = player.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Avatar className={cn("size-9 shrink-0", dimmed && "opacity-40", className)}>
      <AvatarFallback
        className={cn("text-xs font-semibold", player.color)}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
