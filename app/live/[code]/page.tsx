"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMessages, useTranslations } from "next-intl";
import { CircleAlert, LoaderCircle } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RoomProvider } from "@/components/room/room-provider";
import { useRoom } from "@/components/room/use-room";
import { formatRemaining, remainingMs } from "@/components/room/clock";
import {
  fallbackErrorText,
  hasMessage,
  type LiveErrorLike,
} from "../error-text";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return now;
}

export default function LiveRoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();

  return (
    <RoomProvider code={code}>
      <LiveRoom code={code} />
    </RoomProvider>
  );
}

function LiveRoom({ code }: { code: string }) {
  const t = useTranslations();
  const messages = useMessages();
  const phaseT = useTranslations("Phase");
  const roleT = useTranslations("Role");
  const rolesT = useTranslations("Roles");
  const lobbyT = useTranslations("Lobby");
  const common = useTranslations("Common");

  const {
    status,
    view,
    error,
    clockOffset,
    pendingCommandId,
    actions,
  } = useRoom();

  const now = useNow(view?.phaseEndsAt !== null && view?.phaseEndsAt !== undefined);

  function errorText(nextError: LiveErrorLike | null): string {
    if (!nextError) return "";
    if (hasMessage(messages, nextError.messageKey)) {
      return t(nextError.messageKey as string, nextError.params);
    }
    return fallbackErrorText(nextError);
  }

  const statusBanner =
    status === "connected" ? null : (
      <Alert
        data-testid="live-status"
        data-status={status}
        variant={status === "error" ? "destructive" : "default"}
        className="mb-4 p-3"
      >
        {status === "error" ? (
          <CircleAlert />
        ) : (
          <LoaderCircle className="animate-spin" />
        )}
        <AlertTitle>
          {status === "error"
            ? "Connection error"
            : status === "reconnecting"
              ? "Reconnecting"
              : "Connecting"}
        </AlertTitle>
        <AlertDescription>
          {status === "error"
            ? error
              ? errorText(error)
              : "Could not connect to the room."
            : status === "reconnecting"
              ? "Trying to restore your seat…"
              : "Opening the room…"}
        </AlertDescription>
      </Alert>
    );

  if (!view) {
    const noToken = error?.code === "NO_TOKEN";

    return (
      <div className="flex min-h-dvh flex-col px-4 pb-8 pt-5">
        {statusBanner}

        {status === "error" ? (
          <Card className="mt-2">
            <CardContent className="space-y-4">
              <p
                data-testid="live-room-error"
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {noToken
                  ? `This browser has no seat saved for room ${code}. Join or create the room again.`
                  : error
                    ? errorText(error)
                    : "Could not open this room."}
              </p>
              <Link
                href="/live"
                className={buttonVariants({ className: "h-11 w-full" })}
              >
                Back to room entry
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div
            data-testid="live-loading"
            aria-busy="true"
            className="mt-2 space-y-3"
          >
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
            <div className="h-40 animate-pulse rounded-xl bg-muted" />
            <div className="h-11 animate-pulse rounded-xl bg-muted" />
            <span className="sr-only">Loading room…</span>
          </div>
        )}
      </div>
    );
  }

  const isReady = view.readyIds.includes(view.you.id);
  const remaining = remainingMs(view.phaseEndsAt, clockOffset, now);
  const remainingSeconds =
    remaining === null ? null : Math.ceil(remaining / 1000);
  const phaseLabel = phaseT(view.phase, { round: view.round });
  const roleLabel =
    view.phase === "lobby" ? "Waiting" : rolesT(`${view.yourRole}.name`);
  const playerCountLabel = `${view.players.length} / ${view.config.minPlayers}`;

  return (
    <div className="flex min-h-dvh flex-col px-4 pb-8 pt-5">
      {statusBanner}

      {error && status === "connected" ? (
        <Alert
          variant="destructive"
          data-testid="live-error"
          className="mb-4 p-3"
        >
          <CircleAlert />
          <AlertDescription>{errorText(error)}</AlertDescription>
        </Alert>
      ) : null}

      <header className="flex items-start justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {lobbyT("room")}
          </p>
          <p
            data-testid="live-room-code"
            className="mt-1 truncate font-mono text-2xl font-semibold tracking-[0.18em]"
          >
            {view.code}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            data-testid="live-phase"
            data-phase={view.phase}
            data-round={view.round}
            className="text-sm font-medium"
          >
            {phaseLabel}
          </p>
          <p
            data-testid="live-round"
            className="mt-0.5 text-[11px] text-muted-foreground"
          >
            Round {view.round}
          </p>
        </div>
      </header>

      <Card className="mt-4">
        <CardContent className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {roleT("title")}
          </span>
          <span
            data-testid="live-you-role"
            data-role={view.phase === "lobby" ? undefined : view.yourRole}
            className="text-base font-semibold"
          >
            {roleLabel}
          </span>
        </CardContent>
      </Card>

      <section className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Players</h2>
          <span
            data-testid="live-player-count"
            data-count={view.players.length}
            data-min={view.config.minPlayers}
            className="text-xs text-muted-foreground"
          >
            {playerCountLabel}
          </span>
        </div>

        <ul className="mt-2 divide-y overflow-hidden rounded-xl border bg-card">
          {view.players.map((player) => (
            <li
              key={player.id}
              data-testid="live-player"
              data-player-id={player.id}
              data-you={player.isYou ? "true" : undefined}
              data-alive={player.alive ? "true" : "false"}
              data-connected={player.connected ? "true" : "false"}
              className="flex min-h-11 items-center gap-2 px-4 py-2"
            >
              <span
                aria-hidden
                className={
                  player.connected
                    ? "size-2 shrink-0 rounded-full bg-emerald-400"
                    : "size-2 shrink-0 rounded-full bg-muted-foreground/40"
                }
              />
              <span
                className={
                  player.alive
                    ? "min-w-0 flex-1 truncate text-sm font-medium"
                    : "min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground"
                }
              >
                {player.name}
              </span>
              {player.id === view.hostId ? (
                <Badge variant="outline" className="text-[10px]">
                  {common("host")}
                </Badge>
              ) : null}
              {player.isYou ? (
                <Badge className="text-[10px]">{common("you")}</Badge>
              ) : null}
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {player.alive ? "Alive" : common("dead")}
              </span>
              <span className="sr-only">
                {player.connected ? "Connected" : "Disconnected"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {view.phase === "lobby" ? (
        <Card className="mt-4">
          <CardContent className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Lobby</span>
              <span className="text-xs text-muted-foreground">
                Minimum {view.config.minPlayers} players
              </span>
            </div>

            {view.isHost ? (
              <>
                <Button
                  type="button"
                  data-testid="live-start"
                  className="h-11 w-full"
                  disabled={!view.canStart || pendingCommandId !== null}
                  onClick={actions.startGame}
                >
                  {lobbyT("start")}
                </Button>
                {!view.canStart ? (
                  <p className="text-center text-[11px] text-muted-foreground">
                    {view.players.length} of {view.config.minPlayers} seats
                    filled.
                  </p>
                ) : null}
              </>
            ) : (
              <p
                data-testid="live-waiting"
                className="text-center text-sm text-muted-foreground"
              >
                Waiting for the host to start.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-4">
          <CardContent className="space-y-3">
            {remaining !== null ? (
              <p
                data-testid="live-timer"
                data-seconds={remainingSeconds}
                className="text-center font-mono text-sm font-semibold"
              >
                {common("timeLeft", { time: formatRemaining(remaining) })}
              </p>
            ) : null}

            <Button
              type="button"
              data-testid="live-ready"
              className="h-11 w-full"
              disabled={isReady || pendingCommandId !== null}
              onClick={actions.setReady}
            >
              {isReady ? "Ready — waiting" : "I'm ready"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              {common("waitingFor", { count: view.waitingCount })}
            </p>

            {isReady ? (
              <p className="text-center text-[11px] text-muted-foreground">
                Ready. Waiting for the phase to continue.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
