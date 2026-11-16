"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useGame } from "./game-provider";
import type { Player } from "./types";

export function RoleCard({
  player,
  displayBorder = true,
  className,
}: {
  player: Player;
  displayBorder?: boolean;
  className?: string;
}) {
  const t = useTranslations("Role");
  const roleT = useTranslations("Roles");
  const factionT = useTranslations("Faction");
  const { state } = useGame();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!revealed) return;

    const hide = () => setRevealed(false);

    window.addEventListener("pointerup", hide);
    window.addEventListener("pointercancel", hide);
    window.addEventListener("keyup", hide);
    window.addEventListener("blur", hide);

    return () => {
      window.removeEventListener("pointerup", hide);
      window.removeEventListener("pointercancel", hide);
      window.removeEventListener("keyup", hide);
      window.removeEventListener("blur", hide);
    };
  }, [revealed]);

  const crew = state.players.filter(
    (member) => member.faction === "mafia" && member.id !== player.id,
  );

  return (
    <div
      className={cn(
        "rounded-2xl bg-card",
        className,
        displayBorder ? "border p-5" : "",
      )}
    >
      <button
        type="button"
        aria-label={t("pressHint")}
        aria-pressed={revealed}
        className="block w-full touch-none select-none rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          event.preventDefault();
          setRevealed(true);
        }}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            setRevealed(true);
          }
        }}
      >
        <Badge
          variant="secondary"
          className={cn(
            "border-transparent transition-[filter] duration-150",
            !revealed && "blur-[6px]",
          )}
        >
          {factionT(player.faction)}
        </Badge>
        <h2
          data-role-name
          className={cn(
            "mt-3 min-h-9 text-3xl font-semibold tracking-tight transition-[filter] duration-150",
            !revealed && "blur-[7px]",
          )}
        >
          {revealed ? (
            roleT(`${player.roleId}.name`)
          ) : (
            <span
              data-role-redacted
              aria-hidden="true"
              className="inline-block h-7 w-44 rounded-md bg-foreground/60 align-middle"
            />
          )}
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {revealed ? t("holding") : t("pressHint")}
        </p>
      </button>

      <p className="mt-2 text-sm text-muted-foreground">
        {roleT(`${player.roleId}.short`)}
      </p>

      <Separator className="my-4" />

      <div className="space-y-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("ability")}
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            {roleT(`${player.roleId}.ability`)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("win")}
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            {roleT(`${player.roleId}.win`)}
          </p>
        </div>
      </div>

      {player.faction === "mafia" && crew.length > 0 ? (
        <>
          <Separator className="my-4" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("crew")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("crewHint")}
            </p>
            <ul className="mt-2 space-y-1.5">
              {crew.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-medium">{member.name}</span>
                  <span className="text-muted-foreground">
                    {roleT(`${member.roleId}.name`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      <Accordion
        multiple
        className="mt-4"
        onClick={(event) => event.stopPropagation()}
      >
        <AccordionItem value="tip" className="border-0">
          <AccordionTrigger className="py-2 text-sm">
            {t("tip")}
          </AccordionTrigger>
          <AccordionContent className="pb-0 text-sm leading-relaxed text-muted-foreground">
            {roleT(`${player.roleId}.tip`)}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
