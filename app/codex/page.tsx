"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AppShell } from "@/components/game/app-shell";
import { FactionBadge } from "@/components/game/faction-badge";
import { useGame } from "@/components/game/game-provider";
import { ROLES } from "@/components/game/data";
import type { Faction, RoleId } from "@/components/game/types";

const ROLE_IDS = Object.keys(ROLES) as RoleId[];
const FACTIONS: Faction[] = ["mafia", "town", "neutral"];
const RULE_KEYS = [
  "secret",
  "night",
  "day",
  "vote",
  "whisper",
  "report",
  "win",
] as const;
const GLOSSARY_KEYS = [
  "action",
  "faction",
  "frame",
  "majority",
  "roleblock",
  "whisper",
] as const;

function CodexRole({ id }: { id: RoleId }) {
  const t = useTranslations("Codex");
  const roleT = useTranslations("Roles");
  const { state } = useGame();
  const count = state.players.filter((player) => player.roleId === id).length;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            {roleT(`${id}.name`)}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {roleT(`${id}.short`)}
          </p>
        </div>
        <FactionBadge faction={ROLES[id].faction} className="shrink-0" />
      </div>

      {count > 0 ? (
        <Badge variant="secondary" className="mt-2">
          {t("inPlay", { count })}
        </Badge>
      ) : null}

      <Separator className="my-3" />

      <div className="space-y-2.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("abilityLabel")}
          </p>
          <p className="mt-0.5 text-sm leading-relaxed">
            {roleT(`${id}.ability`)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("winLabel")}
          </p>
          <p className="mt-0.5 text-sm leading-relaxed">
            {roleT(`${id}.win`)}
          </p>
        </div>
      </div>
    </div>
  );
}

function CodexContent() {
  const t = useTranslations("Codex");
  const factionT = useTranslations("Faction");
  const ruleT = useTranslations("Rules");
  const glossaryT = useTranslations("Glossary");
  const roleT = useTranslations("Roles");
  const { state } = useGame();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matches = (...values: string[]) =>
    values.some((value) => value.toLowerCase().includes(q));

  const matchedRoles = q
    ? ROLE_IDS.filter((id) =>
        matches(
          roleT(`${id}.name`),
          roleT(`${id}.short`),
          roleT(`${id}.ability`),
          roleT(`${id}.win`),
        ),
      )
    : [];
  const matchedFactions = q
    ? FACTIONS.filter((faction) =>
        matches(
          factionT(faction),
          t(`factionInfo.${faction}.title`),
          t(`factionInfo.${faction}.body`),
        ),
      )
    : [];
  const matchedRules = q
    ? RULE_KEYS.filter((key) =>
        matches(ruleT(`${key}.title`), ruleT(`${key}.body`)),
      )
    : [];
  const matchedGlossary = q
    ? GLOSSARY_KEYS.filter((key) =>
        matches(glossaryT(`${key}.term`), glossaryT(`${key}.def`)),
      )
    : [];
  const hasResults =
    matchedRoles.length +
      matchedFactions.length +
      matchedRules.length +
      matchedGlossary.length >
    0;

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          className="h-11 pl-9"
          aria-label={t("search")}
        />
      </div>

      {q ? (
        <div className="space-y-5">
          {hasResults ? (
            <>
              {matchedRoles.length > 0 ? (
                <section className="space-y-2">
                  <h2 className="text-sm font-medium">{t("roles")}</h2>
                  {matchedRoles.map((id) => (
                    <CodexRole key={id} id={id} />
                  ))}
                </section>
              ) : null}
              {matchedFactions.length > 0 ? (
                <section className="space-y-2">
                  <h2 className="text-sm font-medium">{t("factions")}</h2>
                  {matchedFactions.map((faction) => (
                    <div
                      key={faction}
                      className="rounded-xl border bg-card p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-semibold">
                          {factionT(faction)}
                        </h3>
                        <FactionBadge faction={faction} />
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {t(`factionInfo.${faction}.body`)}
                      </p>
                    </div>
                  ))}
                </section>
              ) : null}
              {matchedRules.length > 0 ? (
                <section className="space-y-2">
                  <h2 className="text-sm font-medium">{t("rules")}</h2>
                  {matchedRules.map((key) => (
                    <div key={key} className="rounded-xl border bg-card p-4">
                      <h3 className="text-sm font-medium">
                        {ruleT(`${key}.title`)}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {ruleT(`${key}.body`)}
                      </p>
                    </div>
                  ))}
                </section>
              ) : null}
              {matchedGlossary.length > 0 ? (
                <section className="space-y-2">
                  <h2 className="text-sm font-medium">{t("glossary")}</h2>
                  {matchedGlossary.map((key) => (
                    <div key={key} className="rounded-xl border bg-card p-4">
                      <h3 className="text-sm font-medium">
                        {glossaryT(`${key}.term`)}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {glossaryT(`${key}.def`)}
                      </p>
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("noResults", { query })}
            </p>
          )}
        </div>
      ) : (
        <Tabs defaultValue="roles" className="gap-4">
          <TabsList className="grid h-11 w-full grid-cols-4">
            <TabsTrigger value="roles" className="text-xs">
              {t("roles")}
            </TabsTrigger>
            <TabsTrigger value="factions" className="text-xs">
              {t("factions")}
            </TabsTrigger>
            <TabsTrigger value="rules" className="text-xs">
              {t("rules")}
            </TabsTrigger>
            <TabsTrigger value="glossary" className="text-xs">
              {t("glossary")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="space-y-2">
            {ROLE_IDS.map((id) => (
              <CodexRole key={id} id={id} />
            ))}
          </TabsContent>

          <TabsContent value="factions" className="space-y-2">
            {FACTIONS.map((faction) => {
              const count = state.players.filter(
                (player) => player.faction === faction,
              ).length;
              return (
                <div key={faction} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">
                      {factionT(faction)}
                    </h3>
                    <FactionBadge faction={faction} />
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {t(`factionInfo.${faction}.body`)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("factionInPlay", { count })}
                  </p>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="rules" className="space-y-2">
            {RULE_KEYS.map((key) => (
              <div key={key} className="rounded-xl border bg-card p-4">
                <h3 className="text-sm font-medium">
                  {ruleT(`${key}.title`)}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {ruleT(`${key}.body`)}
                </p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="glossary" className="space-y-2">
            {GLOSSARY_KEYS.map((key) => (
              <div key={key} className="rounded-xl border bg-card p-4">
                <h3 className="text-sm font-medium">
                  {glossaryT(`${key}.term`)}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {glossaryT(`${key}.def`)}
                </p>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default function CodexPage() {
  return (
    <AppShell>
      <CodexContent />
    </AppShell>
  );
}
