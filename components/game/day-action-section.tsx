"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronRight,
  Crown,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useGame } from "./game-provider";
import { ActionScreen } from "./action-screen";
import type { DayActionKind } from "./types";

const DAY_ACTION_META: Record<
  DayActionKind,
  { icon: LucideIcon; titleKey: string; descriptionKey: string }
> = {
  reveal: {
    icon: Crown,
    titleKey: "reveal.title",
    descriptionKey: "reveal.description",
  },
};

export function DayActionSection() {
  const t = useTranslations("DayActions");
  const common = useTranslations("Common");
  const { state, submitDayAction } = useGame();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<DayActionKind | null>(null);

  if (state.yourDayActions.length === 0) {
    return null;
  }

  function confirm() {
    if (!selected) return;
    submitDayAction(selected);
    setSelected(null);
    setOpen(false);
  }

  return (
    <Drawer open={open} onOpenChange={setOpen} swipeDirection="down" showSwipeHandle>
      <DrawerTrigger
        render={
          <button
            type="button"
            className="flex min-h-16 w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50"
          />
        }
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-faction-neutral/15 text-faction-neutral">
          <Crown className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("cardTitle")}</span>
          <span className="block text-xs text-muted-foreground">
            {t("cardHint")}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </DrawerTrigger>

      <DrawerContent className="h-[88dvh] max-h-[88dvh] bg-background">
        <DrawerTitle className="sr-only">{t("title")}</DrawerTitle>
        <DrawerDescription className="sr-only">
          {t("subtitle")}
        </DrawerDescription>

        <div className="flex shrink-0 justify-end px-4 pt-1">
          <DrawerClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={common("close")}
                className="size-11 rounded-full"
              />
            }
          >
            <X className="size-4" />
          </DrawerClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <ActionScreen phase="day" title={t("title")}>
            <div className="space-y-2">
              {state.yourDayActions.map((kind) => {
                const meta = DAY_ACTION_META[kind];
                const Icon = meta.icon;
                const isSelected = selected === kind;

                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelected(kind)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
                      isSelected && "border-primary bg-primary/5",
                    )}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-faction-neutral/15 text-faction-neutral">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {t(meta.titleKey)}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {t(meta.descriptionKey)}
                      </span>
                    </span>
                    {isSelected ? (
                      <Check className="mt-1 size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </ActionScreen>
        </div>

        <div className="shrink-0 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            className="h-12 w-full"
            disabled={!selected}
            onClick={confirm}
          >
            {t("confirm")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
