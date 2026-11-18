"use client";

import { BookOpen, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { CodexContent } from "./codex-content";

export function CodexDrawerButton() {
  const navT = useTranslations("Nav");
  const codexT = useTranslations("Codex");
  const commonT = useTranslations("Common");

  return (
    <Drawer swipeDirection="down" showSwipeHandle>
      <DrawerTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={navT("codex")}
            className="size-11 rounded-full bg-card/60"
          />
        }
      >
        <BookOpen className="size-4" />
      </DrawerTrigger>

      <DrawerContent className="h-[92dvh] max-h-[92dvh] bg-background">
        <DrawerTitle className="sr-only">{codexT("title")}</DrawerTitle>
        <DrawerDescription className="sr-only">
          {codexT("subtitle")}
        </DrawerDescription>

        <div className="flex shrink-0 justify-end px-4 pt-1">
          <DrawerClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={commonT("close")}
                className="size-11 rounded-full"
              />
            }
          >
            <X className="size-4" />
          </DrawerClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <CodexContent />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
