"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import type { TransportError } from "@/components/room/transport";
import { useGame } from "./game-provider";

/**
 * Compact live-connection state for every game surface. Mock mode omits
 * `status`, so this renders nothing there.
 */
export function ConnectionBanner() {
  const t = useTranslations();
  const router = useRouter();
  const { status, error, resetGame } = useGame();

  // A deleted room must not leave the player on a dead game screen. Every
  // surface that can render `Errors.roomNotFound` renders this banner.
  useEffect(() => {
    if (error?.code !== "ROOM_NOT_FOUND") return;
    resetGame();
    router.replace("/");
  }, [error, resetGame, router]);

  if (status === undefined) return null;

  const reconnecting = status === "connecting" || status === "reconnecting";
  // Command errors arrive while the socket is still connected, so `status`
  // alone is not enough to decide whether to show an error.
  const showError = status === "error" || (!reconnecting && error != null);

  function errorText(nextError: TransportError | null): string {
    if (!nextError) return t("Errors.unknown");

    if (nextError.code === "REPLACED_BY_NEW_CONNECTION") {
      return t("Errors.replacedByNewConnection");
    }
    if (nextError.code === "NO_TOKEN") {
      return t("Errors.noToken");
    }
    if (
      nextError.code === "RATE_LIMIT" ||
      nextError.messageKey === "Errors.rateLimit"
    ) {
      return t("Errors.rateLimit");
    }
    if (nextError.messageKey && t.has(nextError.messageKey)) {
      return t(nextError.messageKey, nextError.params);
    }
    return t("Errors.unknown");
  }

  if (showError) {
    return (
      <Alert
        variant="destructive"
        role="alert"
        className="mb-3 px-3 py-2"
        data-testid="connection-banner"
        data-status="error"
      >
        <CircleAlert aria-hidden />
        <AlertTitle>{errorText(error ?? null)}</AlertTitle>
      </Alert>
    );
  }

  if (reconnecting) {
    return (
      <Alert
        role="status"
        aria-live="polite"
        className="mb-3 px-3 py-2"
        data-testid="connection-banner"
        data-status={status}
      >
        <LoaderCircle aria-hidden className="animate-spin" />
        <AlertTitle>
          {status === "connecting"
            ? t("Errors.connecting")
            : t("Errors.reconnecting")}
        </AlertTitle>
      </Alert>
    );
  }

  return null;
}
