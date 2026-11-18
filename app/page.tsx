"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Drama, Hash, LoaderCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { LocaleSwitcher } from "@/components/game/locale-switcher";
import { CodexDrawerButton } from "@/components/game/codex-drawer-button";
import { BugReportFab } from "@/components/bugs/bug-report-fab";
import { ApiError, checkRoom } from "@/components/room/api";
import {
  clearLastRoom,
  clearToken,
  getLastRoom,
  getToken,
} from "@/components/room/storage";
import { joinFailureFrom } from "@/components/room/join-error";
import type { Phase } from "@/game-core/types";
import { cn } from "@/lib/utils";

// Test

const IS_LIVE = process.env.NEXT_PUBLIC_GAME_MODE === "live";

const ACTIVE_PHASES = new Set<Phase>([
  "roleReveal",
  "night",
  "nightReport",
  "dayDiscussion",
  "voting",
  "voteResult",
]);

const STALE_CHECK_ERRORS = new Set([
  "ROOM_NOT_FOUND",
  "GAME_STARTED",
  "ROOM_FULL",
  "INVALID_TOKEN",
]);

interface RejoinState {
  code: string;
  phase: Phase;
  round: number;
}

type CodeError =
  | "empty"
  | "length"
  | "roomNotFound"
  | "roomFull"
  | "gameStarted"
  | "checkFailed";

const REDIRECT_ERRORS = new Set<string>([
  "empty",
  "length",
  "roomNotFound",
  "roomFull",
  "gameStarted",
  "checkFailed",
]);

function parseRedirectError(value: string | null): CodeError | null {
  return value && REDIRECT_ERRORS.has(value) ? (value as CodeError) : null;
}

/** Drop ?error from the address bar once it has been captured in state. */
function cleanErrorQuery() {
  if (typeof window === "undefined") return;
  if (new URLSearchParams(window.location.search).has("error")) {
    window.history.replaceState(null, "", window.location.pathname);
  }
}

function normalizeCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 5);
}

function LandingFallback() {
  return (
    <div className="flex min-h-dvh flex-col px-4 pb-6 pt-5">
      <div className="h-11" />
      <div className="mt-8 space-y-4">
        <div className="mx-auto size-18 rounded-full bg-muted" />
        <div className="mx-auto h-12 w-56 rounded bg-muted" />
        <div className="h-14 rounded-xl bg-muted/50" />
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={<LandingFallback />}>
      <LandingContent />
    </Suspense>
  );
}

function LandingContent() {
  const t = useTranslations("Landing");
  const phaseT = useTranslations("Phase");
  const rootT = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<CodeError | null>(() =>
    parseRedirectError(searchParams.get("error")),
  );
  const [pending, setPending] = useState(false);
  const [rejoin, setRejoin] = useState<RejoinState | null>(null);

  // The error is captured in initial state; strip it from the URL afterwards
  // so a reload starts clean.
  useEffect(() => {
    cleanErrorQuery();
  }, []);

  useEffect(() => {
    if (!IS_LIVE) return;

    const code = getLastRoom();
    const token = code ? getToken(code) : null;
    if (!code || !token) return;

    let cancelled = false;

    async function checkSavedSeat(roomCode: string, seatToken: string) {
      try {
        const availability = await checkRoom(roomCode, seatToken);
        if (cancelled) return;

        const seat = availability.seat;
        if (!seat) {
          clearToken(roomCode);
          clearLastRoom();
          return;
        }

        if (seat.phase === "gameOver") {
          clearToken(roomCode);
          clearLastRoom();
          return;
        }

        if (!ACTIVE_PHASES.has(seat.phase)) return;

        setRejoin({
          code: roomCode,
          phase: seat.phase,
          round: seat.round,
        });
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof ApiError && STALE_CHECK_ERRORS.has(caught.code)) {
          clearToken(roomCode);
          clearLastRoom();
        }
        // Network/rate-limit/server errors keep the seat for the next visit.
      }
    }

    void checkSavedSeat(code, token);

    return () => {
      cancelled = true;
    };
  }, []);

  const rejoinPhase = rejoin
    ? phaseT(rejoin.phase, { round: rejoin.round })
    : "";

  function clearRedirectError() {
    cleanErrorQuery();
  }

  function errorMessage(value: CodeError): string {
    switch (value) {
      case "empty":
        return t("codeErrors.empty");
      case "length":
        return t("codeErrors.length");
      case "checkFailed":
        return t("codeErrors.checkFailed");
      default:
        return rootT(`Errors.${value}`);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (!code) {
      setError("empty");
      return;
    }

    if (code.length !== 5) {
      setError("length");
      return;
    }

    setError(null);

    if (!IS_LIVE) {
      router.push(`/join?code=${code}`);
      return;
    }

    setPending(true);
    try {
      await checkRoom(code, getToken(code));
      router.push(`/join?code=${code}`);
    } catch (caught) {
      setError(joinFailureFrom(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip px-4 pb-24 pt-5">
      <div
        aria-hidden
        className="noir-atmosphere pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem]"
      />

      <header className="flex items-center justify-end gap-1.5">
        <CodexDrawerButton />
        <LocaleSwitcher />
      </header>

      <main className="flex flex-1 flex-col justify-start py-8">
        <div className="text-center">
          <div className="relative mx-auto grid size-18 place-items-center rounded-full border border-faction-mafia/30 bg-faction-mafia/10 text-faction-mafia shadow-[0_0_46px_-12px_var(--faction-mafia)]">
            <span className="absolute inset-1.5 rounded-full border border-faction-mafia/20" />
            <Drama className="size-8" />
          </div>

          <p className="mt-6 text-[10px] font-medium uppercase tracking-[0.26em] text-faction-mafia">
            {t("table")}
          </p>
          <h1 className="mt-2 font-display text-5xl leading-none tracking-tight sm:text-6xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {rejoin ? (
            <div className="space-y-1.5">
              <Button
                type="button"
                data-testid="rejoin-game"
                className="h-12 w-full gap-2 text-sm"
                onClick={() => router.push("/play")}
              >
                {t("rejoin")}
              </Button>
              <p
                data-testid="rejoin-meta"
                className="text-center text-[11px] text-muted-foreground"
              >
                {t("rejoinMeta", {
                  code: rejoin.code,
                  phase: rejoinPhase,
                })}
              </p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-2.5">
            <Label htmlFor="room-code">{t("joinLabel")}</Label>

            <InputGroup
              className={cn(
                "h-14 rounded-xl border-border/80 bg-background/60 pr-1",
                error && "border-destructive",
              )}
            >
              <InputGroupAddon align="inline-start">
                <InputGroupText>
                  <Hash className="size-4" />
                </InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="room-code"
                value={code}
                onChange={(event) => {
                  setCode(normalizeCode(event.target.value));
                  setError(null);
                  clearRedirectError();
                }}
                placeholder={t("codePlaceholder")}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={5}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "room-code-error" : undefined}
                className="font-mono text-lg tracking-[0.32em] uppercase placeholder:tracking-[0.18em] placeholder:text-muted-foreground/50"
              />
              <InputGroupAddon align="inline-end" className="pr-1.5">
                <InputGroupButton
                  type="submit"
                  variant="default"
                  disabled={pending}
                  aria-busy={pending}
                  className="h-11 gap-1.5 rounded-lg px-4 text-sm"
                >
                  {t("join")}
                  {pending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>

            {error ? (
              <p id="room-code-error" className="text-xs text-destructive">
                {errorMessage(error)}
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("joinHint")}
              </p>
            )}
          </form>

          <div className="flex items-center gap-3 px-1 text-[9px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("or")}
            <span className="h-px flex-1 bg-border" />
          </div>

          <Link
            href="/create"
            className={buttonVariants({
              variant: "outline",
              className:
                "min-h-14 w-full justify-between! whitespace-normal rounded-xl border-border/80 bg-card/40 px-4 py-2.5 text-sm backdrop-blur hover:bg-card/70",
            })}
          >
            <span className="text-left">
              <span className="block">{t("create")}</span>
              <span className="block text-[10px] font-normal text-muted-foreground">
                {t("createHint")}
              </span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        </div>
      </main>

      <BugReportFab />
    </div>
  );
}
