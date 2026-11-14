"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, BookOpen, MessageSquare, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGame } from "./game-provider";

export function BottomNav() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const { unreadWhispers, unreadAlerts } = useGame();

  const items = [
    { href: "/play", label: t("table"), icon: Users, badge: 0 },
    {
      href: "/whispers",
      label: t("whispers"),
      icon: MessageSquare,
      badge: unreadWhispers,
    },
    { href: "/alerts", label: t("alerts"), icon: Bell, badge: unreadAlerts },
    { href: "/codex", label: t("codex"), icon: BookOpen, badge: 0 },
    { href: "/admin", label: t("admin"), icon: Shield, badge: 0 },
  ];

  return (
    <nav
      aria-label={t("table")}
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/play" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative">
                <item.icon className="size-5" />
                {item.badge > 0 ? (
                  <span className="absolute -right-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-faction-mafia px-1 text-[9px] font-semibold leading-4 text-white">
                    {item.badge}
                  </span>
                ) : null}
              </span>
              <span>{item.label}</span>
              {active ? (
                <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-foreground" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
