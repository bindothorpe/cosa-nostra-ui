"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Drama } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROOM_CODE } from "@/components/game/data";
import { useGame } from "@/components/game/game-provider";
import { LocaleSwitcher } from "@/components/game/locale-switcher";

export default function JoinPage() {
  const t = useTranslations("Join");
  const router = useRouter();
  const { join, state } = useGame();
  const [name, setName] = useState(state.playerName);
  const [error, setError] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError(true);
      return;
    }
    setError(false);
    join(name);
    router.push("/lobby");
  }

  return (
    <div className="relative flex min-h-dvh flex-col px-5 pb-8 pt-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("mockRoom")}
        </span>
        <LocaleSwitcher />
      </div>

      <div className="flex flex-1 flex-col justify-center gap-8 py-8">
        <div className="space-y-3 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-black/20">
            <Drama className="size-8" />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <Card>
          <CardContent className="p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="player-name">{t("name")}</Label>
                <Input
                  id="player-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(false);
                  }}
                  placeholder={t("namePlaceholder")}
                  className="h-12 text-base"
                  autoComplete="nickname"
                  aria-invalid={error}
                  aria-describedby={error ? "name-error" : undefined}
                />
                {error ? (
                  <p id="name-error" className="text-xs text-destructive">
                    {t("nameRequired")}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
                <span className="text-xs text-muted-foreground">
                  {t("roomCode")}
                </span>
                <span className="font-mono text-sm font-semibold tracking-[0.16em]">
                  {ROOM_CODE}
                </span>
              </div>

              <Button type="submit" className="h-12 w-full text-sm">
                {t("join")}
              </Button>
            </form>

            <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
              {t("hint")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
