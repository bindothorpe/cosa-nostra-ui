"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Drama, Hash } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { LocaleSwitcher } from "@/components/game/locale-switcher";
import { cn } from "@/lib/utils";

type CodeError = "empty" | "length" | null;

function normalizeCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 5);
}

export default function LandingPage() {
  const t = useTranslations("Landing");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<CodeError>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!code) {
      setError("empty");
      return;
    }

    if (code.length !== 5) {
      setError("length");
      return;
    }

    router.push(`/join?code=${code}`);
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip px-4 pb-6 pt-5">
      <div
        aria-hidden
        className="noir-atmosphere pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem]"
      />

      <header className="flex justify-end">
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
                  className="h-11 gap-1.5 rounded-lg px-4 text-sm"
                >
                  {t("join")}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>

            {error ? (
              <p id="room-code-error" className="text-xs text-destructive">
                {t(`codeErrors.${error}`)}
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
    </div>
  );
}
