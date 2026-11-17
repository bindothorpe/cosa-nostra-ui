"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Bug, LoaderCircle, RefreshCw } from "lucide-react";
import { LocaleSwitcher } from "@/components/game/locale-switcher";
import { listBugs, type BugReport } from "@/components/room/api";
import { Button, buttonVariants } from "@/components/ui/button";

type Status = "loading" | "ready" | "error";

function formatDate(locale: string, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function BugsList() {
  const t = useTranslations("Bugs");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("loading");
  const [bugs, setBugs] = useState<BugReport[]>([]);

  useEffect(() => {
    let cancelled = false;

    listBugs()
      .then((next) => {
        if (cancelled) return;
        setBugs(next);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function retry() {
    setStatus("loading");
    listBugs()
      .then((next) => {
        setBugs(next);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col px-4 pb-10 pt-5">
      <div
        aria-hidden
        className="noir-atmosphere pointer-events-none absolute inset-x-0 top-0 -z-10 h-80"
      />

      <header className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className={buttonVariants({
            variant: "ghost",
            className: "min-h-11 gap-1.5 px-2 text-sm",
          })}
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
        <LocaleSwitcher />
      </header>

      <main className="mt-8 flex-1">
        <h1 className="font-display text-4xl leading-none tracking-tight">
          {t("pageTitle")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("pageSubtitle")}
        </p>

        <div className="mt-6 space-y-3">
          {status === "loading" ? (
            <>
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="space-y-3 rounded-xl border border-border/80 bg-card/30 p-4"
                >
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              ))}
              <p className="sr-only" role="status">
                {t("loading")}
              </p>
            </>
          ) : null}

          {status === "error" ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm text-destructive" role="alert">
                {t("loadError")}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={retry}
                className="mt-3 min-h-11 gap-1.5"
              >
                <RefreshCw className="size-4" />
                {t("retry")}
              </Button>
            </div>
          ) : null}

          {status === "ready" && bugs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/80 p-8 text-center">
              <Bug className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          ) : null}

          {status === "ready"
            ? bugs.map((bug) => (
                <article
                  key={bug.id}
                  className="rounded-xl border border-border/80 bg-card/40 p-4 backdrop-blur"
                >
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {bug.message}
                  </p>
                  <footer className="mt-3 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <time dateTime={bug.createdAt}>
                      {formatDate(locale, bug.createdAt)}
                    </time>
                    <span className="font-mono normal-case tracking-normal">
                      #{bug.id.slice(0, 8)}
                    </span>
                  </footer>
                </article>
              ))
            : null}
        </div>

        {status === "loading" ? (
          <LoaderCircle className="mx-auto mt-4 size-4 animate-spin text-muted-foreground" />
        ) : null}
      </main>
    </div>
  );
}
