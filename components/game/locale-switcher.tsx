"use client";

import { useEffect, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/locale";
import type { Locale } from "@/i18n/request";
import { cn } from "@/lib/utils";

const LOCALES: Locale[] = ["en", "nl"];

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("Locale");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function switchLocale(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("switch")}
      aria-busy={pending}
      className={cn(
        "flex items-center gap-0.5 rounded-full border bg-card p-0.5",
        className,
      )}
    >
      {LOCALES.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => switchLocale(item)}
          aria-pressed={locale === item}
          disabled={pending}
          className={cn(
            "min-h-11 min-w-10 rounded-full text-[11px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-60",
            locale === item
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(item)}
        </button>
      ))}
    </div>
  );
}
