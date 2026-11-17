"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bug, CheckCircle2, LoaderCircle } from "lucide-react";
import { ApiError, reportBug } from "@/components/room/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";

const MAX_LENGTH = 2000;
const AUTO_CLOSE_MS = 1500;

export function BugReportFab() {
  const t = useTranslations("Bugs");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  useEffect(() => clearCloseTimer, []);

  function resetForm() {
    clearCloseTimer();
    // Invalidate any in-flight submission so a late response can't revive
    // the success state after the dialog has been closed.
    requestId.current += 1;
    setOpen(false);
    setMessage("");
    setPending(false);
    setSuccess(false);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setOpen(true);
      setError(null);
      return;
    }
    resetForm();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || pending) return;

    const id = ++requestId.current;
    setPending(true);
    setError(null);

    try {
      await reportBug(trimmed);
      if (id !== requestId.current) return;

      setSuccess(true);
      closeTimer.current = setTimeout(() => {
        if (id === requestId.current) resetForm();
      }, AUTO_CLOSE_MS);
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(
        caught instanceof ApiError && caught.code === "BUG_RATE_LIMIT"
          ? t("rateLimited")
          : t("error"),
      );
    } finally {
      if (id === requestId.current) setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md">
        <div className="flex justify-end px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <DialogTrigger
            render={
              <Button
                type="button"
                aria-label={t("open")}
                className="pointer-events-auto size-14 rounded-full shadow-lg shadow-primary/25"
              />
            }
          >
            <Bug className="size-6" />
          </DialogTrigger>
        </div>
      </div>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {success ? (
          <div
            role="status"
            className="flex flex-col items-center gap-2 py-6 text-center"
          >
            <CheckCircle2 className="size-10 text-primary" />
            <p className="text-sm font-medium">{t("success")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-2">
            <Label htmlFor="bug-message">{t("messageLabel")}</Label>

            <InputGroup className="rounded-xl bg-background/60">
              <InputGroupTextarea
                id="bug-message"
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setError(null);
                }}
                placeholder={t("placeholder")}
                maxLength={MAX_LENGTH}
                rows={5}
                className="min-h-28"
              />
              <InputGroupAddon
                align="block-end"
                className="justify-between border-t"
              >
                <InputGroupText className="text-[11px] tabular-nums">
                  {t("charCount", {
                    count: message.length,
                    max: MAX_LENGTH,
                  })}
                </InputGroupText>
                <InputGroupButton
                  type="submit"
                  variant="default"
                  disabled={!message.trim() || pending}
                  aria-busy={pending}
                  className="min-h-11 gap-1.5 px-4"
                >
                  {pending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  {pending ? t("submitting") : t("submit")}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>

            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("hint")}
              </p>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
