"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages, useTranslations } from "next-intl";
import { CircleAlert, Plus, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  createRoom,
  joinRoom,
  type RoomIdentity,
} from "@/components/room/api";
import {
  clearLastRoom,
  clearToken,
  getLastRoom,
  getToken,
  setLastRoom,
  setName,
  setToken,
} from "@/components/room/storage";
import { fallbackErrorText, hasMessage, type LiveErrorLike } from "./error-text";

const CODE_LENGTH = 5;
const CODE_PATTERN = /^[A-Z0-9]{5}$/;

function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
}

export default function LiveLandingPage() {
  const t = useTranslations();
  const messages = useMessages();
  const router = useRouter();

  const [name, setNameValue] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function describeError(error: LiveErrorLike): string {
    if (hasMessage(messages, error.messageKey)) {
      return t(error.messageKey as string, error.params);
    }
    return fallbackErrorText(error);
  }

  function toError(caught: unknown): LiveErrorLike {
    if (caught instanceof ApiError) {
      return {
        code: caught.code,
        messageKey: caught.messageKey,
        params: caught.params,
      };
    }
    return { code: "UNKNOWN", messageKey: "Errors.unknown" };
  }

  function storeIdentity(identity: RoomIdentity, displayName: string) {
    setToken(identity.code, identity.token);
    setLastRoom(identity.code);
    setName(displayName);
    router.push(`/live/${encodeURIComponent(identity.code)}`);
  }

  async function handleCreate() {
    const displayName = name.trim();
    if (!displayName) {
      setFormError(t("Identity.nameRequired"));
      return;
    }

    setBusy("create");
    setFormError(null);

    try {
      const identity = await createRoom(displayName, "default");
      storeIdentity(identity, displayName);
    } catch (caught) {
      setFormError(describeError(toError(caught)));
    } finally {
      setBusy(null);
    }
  }

  async function handleJoin() {
    const displayName = name.trim();
    if (!displayName) {
      setFormError(t("Identity.nameRequired"));
      return;
    }
    if (!CODE_PATTERN.test(code)) {
      setFormError("Enter the 6-character room code.");
      return;
    }

    setBusy("join");
    setFormError(null);

    try {
      // Passing a stored token reclaims an existing seat after a refresh or
      // a second tab, which the join endpoint supports.
      const identity = await joinRoom(code, displayName, getToken(code));
      storeIdentity(identity, displayName);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "ROOM_NOT_FOUND") {
        clearToken(code);
        if (getLastRoom() === code) clearLastRoom();
        router.replace("/");
        return;
      }
      setFormError(describeError(toError(caught)));
    } finally {
      setBusy(null);
    }
  }

  const canSubmit = name.trim().length > 0 && busy === null;

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip px-4 pb-8 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-faction-mafia">
            Live
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Multiplayer
          </h1>
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-full border bg-card/60 text-muted-foreground">
          <Users className="size-4" />
        </span>
      </header>

      <main className="mt-6 flex-1 space-y-5">
        {formError ? (
          <Alert variant="destructive" data-testid="live-error" className="p-3">
            <CircleAlert />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="live-name">{t("Identity.name")}</Label>
              <Input
                id="live-name"
                className="h-11"
                value={name}
                maxLength={20}
                autoComplete="off"
                placeholder={t("Identity.namePlaceholder")}
                onChange={(event) => {
                  setNameValue(event.target.value);
                  setFormError(null);
                }}
              />
            </div>

            <Button
              type="button"
              data-testid="live-create"
              className="h-11 w-full gap-2"
              disabled={!canSubmit}
              onClick={handleCreate}
            >
              <Plus className="size-4" />
              {busy === "create" ? "Creating room…" : t("Landing.create")}
            </Button>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <span aria-hidden className="h-px flex-1 bg-border" />
          {t("Landing.or")}
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>

        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="live-code">{t("Landing.joinLabel")}</Label>
              <Input
                id="live-code"
                className="h-11 text-center font-mono text-lg font-semibold uppercase tracking-[0.35em]"
                value={code}
                maxLength={CODE_LENGTH}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ABC123"
                aria-describedby="live-code-hint"
                onChange={(event) => {
                  setCode(normalizeCode(event.target.value));
                  setFormError(null);
                }}
              />
              <p
                id="live-code-hint"
                className="text-xs text-muted-foreground"
              >
                6 characters, letters and numbers.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              data-testid="live-join"
              className="h-11 w-full"
              disabled={!canSubmit || code.length !== CODE_LENGTH}
              onClick={handleJoin}
            >
              {busy === "join" ? "Joining…" : t("Landing.join")}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          Your seat is stored on this phone. Clearing browser data loses it.
        </p>
      </main>
    </div>
  );
}
