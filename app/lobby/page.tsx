"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, CircleAlert, Copy, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGame } from "@/components/game/game-provider";
import { LocaleSwitcher } from "@/components/game/locale-switcher";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { RoomConfigSummary } from "@/components/room/room-config-summary";

export default function LobbyPage() {
  const t = useTranslations("Lobby");
  const common = useTranslations("Common");
  const router = useRouter();
  const { state, startGame, resetGame } = useGame();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  async function copyLink() {
    const inviteUrl = new URL("/join", window.location.origin);
    inviteUrl.searchParams.set("code", state.roomCode);

    try {
      await navigator.clipboard.writeText(inviteUrl.toString());
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), 1800);
  }

  if (!state.joined) {
    return (
      <div className="flex min-h-dvh flex-col px-4 pb-8 pt-5">
        <div className="flex justify-end">
          <LocaleSwitcher />
        </div>
        <div className="flex flex-1 items-center">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>{t("joinFirst")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/"
                className={buttonVariants({ className: "h-11 w-full" })}
              >
                {t("joinFirst")}
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col px-4 pb-8 pt-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("room", { code: state.roomCode })}
        </span>
        <LocaleSwitcher />
      </div>

      <div className="mt-6 space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card className="mt-5">
        <CardContent className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("room", { code: state.roomCode })}
            </p>
            <p className="mt-1 font-mono text-xl font-semibold tracking-[0.18em]">
              {state.roomCode}
            </p>
          </div>
          <Button
            type="button"
            variant={copyState === "failed" ? "destructive" : "outline"}
            className="h-11 shrink-0 gap-2"
            onClick={copyLink}
          >
            {copyState === "copied" ? (
              <Check className="size-4" />
            ) : copyState === "failed" ? (
              <CircleAlert className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
            {copyState === "copied"
              ? t("copied")
              : copyState === "failed"
                ? t("copyFailed")
                : t("copy")}
          </Button>
        </CardContent>
      </Card>

      <RoomConfigSummary className="mt-4" config={state.roomConfig} />

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {t("players", {
            count: state.players.length,
            max: state.roomConfig.playerCount,
          })}
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          {common("ready")}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-4">
        {state.players.map((player) => (
          <div
            key={player.id}
            className="flex flex-col items-center gap-1.5 text-center"
          >
            <div className="relative">
              <PlayerAvatar player={player} className="size-12" />
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background bg-emerald-400" />
            </div>
            <span className="w-full truncate text-xs font-medium">
              {player.name}
            </span>
            {player.isYou && state.isHost ? (
              <Badge
                variant="outline"
                className="h-4 px-1.5 text-[9px] uppercase tracking-wide text-faction-mafia"
              >
                {common("host")}
              </Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">
                {player.isYou ? common("you") : common("ready")}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-3 pt-8">
        <Button
          type="button"
          className="h-12 w-full"
          onClick={() => {
            startGame();
            router.push("/play");
          }}
        >
          {t("start")}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          {t("hint")}
        </p>
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-full gap-2 text-muted-foreground"
          onClick={() => {
            resetGame();
            router.push("/");
          }}
        >
          <LogOut className="size-4" />
          {t("leave")}
        </Button>
      </div>
    </div>
  );
}
