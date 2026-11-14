"use client";

import { useTranslations } from "next-intl";
import type { Phase } from "./types";

export function usePhaseLabel(phase: Phase, round: number) {
  const t = useTranslations("Phase");

  switch (phase) {
    case "lobby":
      return t("lobby");
    case "roleReveal":
      return t("roleReveal");
    case "night":
      return t("night", { round });
    case "nightReport":
      return t("nightReport", { round });
    case "dayDiscussion":
      return t("dayDiscussion", { round });
    case "voting":
      return t("voting", { round });
    case "voteResult":
      return t("voteResult");
    case "gameOver":
      return t("gameOver");
  }
}
