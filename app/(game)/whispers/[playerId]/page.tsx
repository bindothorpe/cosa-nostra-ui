"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useGame } from "@/components/game/game-provider";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { cn } from "@/lib/utils";

/** Distance from the bottom (px) that still counts as following the chat. */
const NEAR_BOTTOM_PX = 96;

export default function WhisperThreadPage() {
  const params = useParams<{ playerId: string }>();
  const playerId = params.playerId;
  const t = useTranslations("Whispers");
  const {
    getPlayer,
    state,
    sendWhisper,
    markThreadRead,
    ensureThread,
    you,
  } = useGame();
  const [text, setText] = useState("");
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const initialScrollDone = useRef(false);

  const player = getPlayer(playerId);
  const thread = state.whispers.find((item) => item.playerId === playerId);
  const messages = thread?.messages ?? [];
  const blockedNotice = !you.alive
    ? t("deadCannotSend")
    : player && !player.alive
      ? t("recipientDead")
      : state.whispersLeft <= 0
        ? t("limitReached")
        : null;
  const canSend =
    you.alive &&
    !!player?.alive &&
    state.whispersLeft > 0 &&
    text.trim().length > 0;

  const getViewport = useCallback(
    () =>
      scrollRootRef.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      ) ?? null,
    [],
  );

  useEffect(() => {
    if (!player) return;
    ensureThread(playerId);
    markThreadRead(playerId);
  }, [playerId, player, ensureThread, markThreadRead]);

  // Track whether the reader is at the bottom, so incoming whispers don't
  // yank them away from older messages.
  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const handleScroll = () => {
      const distance =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      stickToBottom.current = distance <= NEAR_BOTTOM_PX;
    };

    handleScroll();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [getViewport]);

  // Reset the follow state when switching conversations.
  useEffect(() => {
    stickToBottom.current = true;
    initialScrollDone.current = false;
  }, [playerId]);

  // Jump to the newest message on open, then follow new ones only when the
  // reader is already near the bottom.
  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      viewport.scrollTop = viewport.scrollHeight;
      return;
    }

    if (stickToBottom.current) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }
  }, [getViewport, playerId, messages.length]);

  if (!player) {
    return (
      <div className="space-y-4">
        <Link
          href="/whispers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("title")}
        </Link>
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {t("noPlayers")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b pb-3">
        <Link
          href="/whispers"
          aria-label={t("title")}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <PlayerAvatar player={player} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{player.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {t("remaining", { count: state.whispersLeft })}
          </p>
        </div>
      </header>

      <div ref={scrollRootRef} className="relative min-h-0 flex-1">
        {/* Absolute wrapper gives ScrollArea a definite height to fill. */}
        <div className="absolute inset-0">
          <ScrollArea className="size-full">
            <div className="space-y-2.5 py-4">
              {messages.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                {t("newHint", { name: player.name })}
              </p>
            ) : (
              messages.map((message) => {
                const body =
                  message.text ?? (message.textKey ? t(message.textKey) : "");
                const mine = message.from === "you";

                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      mine ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3.5 py-2.5",
                        mine
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md border bg-card",
                      )}
                    >
                      <p className="text-sm leading-relaxed">{body}</p>
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          mine
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {message.time}
                      </p>
                    </div>
                  </div>
                );
              })
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Composer sits above the fixed bottom nav (4rem + safe area). */}
      <div className="shrink-0 pt-2 pb-[calc(4rem+max(0.5rem,env(safe-area-inset-bottom))+0.5rem)]">
        {blockedNotice ? (
          <p className="pb-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            {blockedNotice}
          </p>
        ) : null}

        <form
          className="rounded-xl border bg-background p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSend) return;
            sendWhisper(playerId, text);
            setText("");
          }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("placeholder")}
              rows={1}
              disabled={!you.alive || !player.alive || state.whispersLeft <= 0}
              className="min-h-11 max-h-28 resize-none overflow-y-auto border-0 bg-transparent px-2 py-3 text-base shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!canSend) return;
                  sendWhisper(playerId, text);
                  setText("");
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="size-11 shrink-0"
              disabled={!canSend}
              aria-label={t("send")}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
