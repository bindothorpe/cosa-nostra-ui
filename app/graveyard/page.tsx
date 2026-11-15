"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lock, Send, Skull } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/components/game/app-shell";
import { useGame } from "@/components/game/game-provider";
import { PlayerAvatar } from "@/components/game/player-avatar";

function GraveyardContent() {
  const t = useTranslations("Graveyard");
  const {
    state,
    you,
    getPlayer,
    sendGraveyardMessage,
    markGraveyardRead,
  } = useGame();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (you.alive) return;
    markGraveyardRead();
  }, [you.alive, markGraveyardRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [state.graveyard.length]);

  if (you.alive) {
    return (
      <div className="flex min-h-[60dvh] items-center">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="grid size-14 place-items-center rounded-full border bg-card">
              <Lock className="size-6 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold">{t("lockedTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("lockedBody")}</p>
            <Link
              href="/whispers"
              className={buttonVariants({
                variant: "outline",
                className: "mt-2 h-11 w-full",
              })}
            >
              {t("backToWhispers")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[calc(100dvh-9rem)] flex-col"
      data-graveyard
    >
      <header className="space-y-1.5 border-b pb-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Skull className="size-3" />
          {t("pinned")}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="flex-1 space-y-4 py-4">
        {state.graveyard.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          state.graveyard.map((message) => {
            const player = getPlayer(message.playerId);
            const body =
              message.text ??
              (message.textKey ? t(message.textKey) : "");

            return (
              <div key={message.id} className="flex gap-3">
                {player ? (
                  <PlayerAvatar player={player} className="size-9" dimmed />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
                    <Skull className="size-4 text-muted-foreground" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">
                      {player?.name ?? "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {message.time}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-20 rounded-xl border bg-background p-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          sendGraveyardMessage(text);
          setText("");
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("placeholder")}
            rows={1}
            className="min-h-11 resize-none border-0 bg-transparent px-2 py-3 text-base shadow-none focus-visible:ring-0"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!text.trim()) return;
                sendGraveyardMessage(text);
                setText("");
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0"
            disabled={!text.trim()}
            aria-label={t("send")}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function GraveyardPage() {
  return (
    <AppShell>
      <GraveyardContent />
    </AppShell>
  );
}
