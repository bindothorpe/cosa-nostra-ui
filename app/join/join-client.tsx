"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMessages, useTranslations } from "next-intl";
import { ArrowLeft, CircleAlert, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/game/locale-switcher";
import { useGame } from "@/components/game/game-provider";
import { IdentityFields } from "@/components/room/identity-fields";
import { ApiError, checkRoom } from "@/components/room/api";
import { getToken } from "@/components/room/storage";
import { joinFailureFrom } from "@/components/room/join-error";
import { hasMessage } from "@/app/live/error-text";

const IS_LIVE = process.env.NEXT_PUBLIC_GAME_MODE === "live";

type CheckStatus = "checking" | "ready" | "redirecting";

export function JoinClient() {
  const t = useTranslations("JoinRoom");
  const rootT = useTranslations();
  const messages = useMessages();
  const identityT = useTranslations("Identity");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { joinRoom } = useGame();
  const rawCode = (searchParams.get("code") ?? "").toUpperCase();
  const code = /^[A-Z]{5}$/.test(rawCode) ? rawCode : null;

  const [status, setStatus] = useState<CheckStatus>(() =>
    !code ? "redirecting" : IS_LIVE ? "checking" : "ready",
  );
  const [name, setName] = useState("");
  const [allowComplexRoles, setAllowComplexRoles] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Verify the invitation before showing the form; send the user back to the
  // landing page with a reason when the room is gone, full, or already started.
  useEffect(() => {
    if (!code) {
      router.replace(`/?error=${rawCode ? "length" : "empty"}`);
      return;
    }

    if (!IS_LIVE) return;

    let cancelled = false;

    async function verify(roomCode: string) {
      try {
        await checkRoom(roomCode, getToken(roomCode));
        if (!cancelled) setStatus("ready");
      } catch (caught) {
        if (cancelled) return;
        setStatus("redirecting");
        router.replace(`/?error=${joinFailureFrom(caught)}`);
      }
    }

    void verify(code);

    return () => {
      cancelled = true;
    };
  }, [code, rawCode, router]);

  function describeError(caught: unknown): string {
    if (typeof caught === "object" && caught !== null && "messageKey" in caught) {
      const { messageKey, params } = caught as {
        messageKey?: unknown;
        params?: Record<string, string | number>;
      };
      if (typeof messageKey === "string" && hasMessage(messages, messageKey)) {
        try {
          return rootT(messageKey as string, params);
        } catch {
          // Missing params for a known key: use the local fallback instead.
        }
      }
    }

    return t("joinError");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code || pending) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(identityT("nameRequired"));
      return;
    }
    if (trimmed.length > 20) {
      setNameError(identityT("nameTooLong"));
      return;
    }

    setNameError(null);
    setSubmitError(null);
    setPending(true);

    try {
      await joinRoom({ code, name: trimmed, allowComplexRoles });
      router.push("/lobby");
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "ROOM_NOT_FOUND") {
        router.replace("/?error=roomNotFound");
        return;
      }
      if (caught instanceof ApiError && caught.code === "NAME_TAKEN") {
        setSubmitError(null);
        setNameError(t("nameTaken"));
        return;
      }
      setSubmitError(describeError(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip px-4 pb-8 pt-5">
      <div
        aria-hidden
        className="noir-atmosphere pointer-events-none absolute inset-x-0 top-0 -z-10 h-80"
      />

      <header className="flex items-center justify-between gap-3">
        <Link
          href="/"
          aria-label={t("back")}
          className="grid size-11 place-items-center rounded-full border bg-card/60 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <LocaleSwitcher />
      </header>

      {status !== "ready" ? (
        <main
          className="flex flex-1 flex-col items-center justify-center gap-3 py-8"
          aria-busy="true"
        >
          <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t("checking")}
          </p>
        </main>
      ) : (
        <main className="flex flex-1 flex-col justify-center py-8">
          <div className="text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-faction-mafia">
              {t("eyebrow")}
            </p>
            <h1 className="mt-2 font-display text-4xl leading-none tracking-tight">
              {t("title")}
            </h1>
            {/* <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t("subtitle")}
            </p> */}
          </div>

          <div className="mt-6">
            <p className="text-center text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t("codeLabel")}
            </p>
            <div className="mt-2 flex justify-center gap-1.5">
              {(code ?? "").split("").map((letter, index) => (
                <span
                  key={`${letter}-${index}`}
                  className="grid size-11 place-items-center rounded-xl border border-border/80 bg-card/60 font-mono text-xl font-semibold shadow-sm"
                >
                  {letter}
                </span>
              ))}
            </div>
          </div>

          <Card className="mt-6 border-border/80 bg-card/70 backdrop-blur">
            <CardContent className="p-4">
              <form onSubmit={handleSubmit} className="space-y-5">
                <IdentityFields
                  idPrefix="join"
                  name={name}
                  onNameChange={(value) => {
                    setName(value);
                    setNameError(null);
                    setSubmitError(null);
                  }}
                  allowComplexRoles={allowComplexRoles}
                  onAllowComplexRolesChange={setAllowComplexRoles}
                  nameError={nameError}
                />

                {submitError ? (
                  <Alert variant="destructive" className="p-3">
                    <CircleAlert />
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                ) : null}

                <Button
                  type="submit"
                  className="h-12 w-full gap-2 text-sm"
                  disabled={pending}
                >
                  {t("join")}
                  {pending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      )}
    </div>
  );
}
