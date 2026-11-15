"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useGame } from "./game-provider";
import { RoleCard } from "./role-card";

export function RolePeekButton() {
  const t = useTranslations("Role");
  const { you } = useGame();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            aria-label={t("peek")}
          />
        }
      >
        <Eye className="size-5" />
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <RoleCard player={you} />
      </DialogContent>
    </Dialog>
  );
}
