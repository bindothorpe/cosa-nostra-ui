"use client";

import { useTranslations } from "next-intl";
import { useGame } from "../game-provider";
import { ActionPanel } from "../action-panel";
import { ActionScreen } from "../action-screen";
import { ReadyFooter } from "../ready-footer";

export function NightActionScreen() {
  const t = useTranslations("Action");
  const { yourRole } = useGame();

  return (
    <ActionScreen phase="night" title={t("nightTitle")}>
      <ActionPanel />
      {yourRole.abilityPhase !== "night" ? <ReadyFooter /> : null}
    </ActionScreen>
  );
}
