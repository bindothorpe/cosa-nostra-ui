"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/game/locale-switcher";
import { useGame } from "@/components/game/game-provider";
import { IdentityFields } from "@/components/room/identity-fields";

export function JoinClient() {
  const t = useTranslations("JoinRoom");
  const identityT = useTranslations("Identity");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { joinRoom } = useGame();
  const rawCode = (searchParams.get("code") ?? "").toUpperCase();
  const code = /^[A-Z]{5}$/.test(rawCode) ? rawCode : null;

  const [name, setName] = useState("");
  const [allowComplexRoles, setAllowComplexRoles] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code) return;

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
    joinRoom({ code, name: trimmed, allowComplexRoles });
    router.push("/lobby");
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

      {!code ? (
        <main className="flex flex-1 items-center py-8">
          <div className="w-full space-y-4">
            <Alert variant="destructive" className="p-4">
              <KeyRound />
              <AlertTitle>{t("invalidTitle")}</AlertTitle>
              <AlertDescription>{t("invalidBody")}</AlertDescription>
            </Alert>
            <Link
              href="/"
              className={buttonVariants({
                variant: "outline",
                className: "h-12 w-full",
              })}
            >
              {t("back")}
            </Link>
          </div>
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
              {code.split("").map((letter, index) => (
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
                  }}
                  allowComplexRoles={allowComplexRoles}
                  onAllowComplexRolesChange={setAllowComplexRoles}
                  nameError={nameError}
                />

                <Button type="submit" className="h-12 w-full text-sm">
                  {t("join")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      )}
    </div>
  );
}
