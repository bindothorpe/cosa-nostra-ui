"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMessages, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, CircleAlert, LoaderCircle } from "lucide-react";
import {
  canDisableRole,
  createFullRolePool,
  requiresDuplicates,
  resolveRoleCounts,
  type RolePool,
} from "@/game-core/role-selection";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/game/locale-switcher";
import { useGame } from "@/components/game/game-provider";
import {
  buildRoomConfig,
  DEFAULT_PHASE_DURATIONS,
  DEFAULT_PLAYER_COUNT,
  defaultFactionCounts,
  factionTotal,
  invalidPhaseDurations,
  MAX_PLAYERS,
  MIN_PLAYERS,
  validateFactionCounts,
} from "@/components/game/room-config";
import type {
  FactionCounts,
  PhaseDurations,
  RoleId,
  RoomPreset,
} from "@/components/game/types";
import { FactionDistribution } from "@/components/room/faction-distribution";
import { IdentityFields } from "@/components/room/identity-fields";
import { NumberStepper } from "@/components/room/number-stepper";
import { PhaseTimers } from "@/components/room/phase-timers";
import { RoleSelection, type RoleTab } from "@/components/room/role-selection";
import { RoomConfigSummary } from "@/components/room/room-config-summary";
import { WizardProgress } from "@/components/room/wizard-progress";
import { hasMessage } from "@/app/live/error-text";

const STEP_KEYS = ["table", "roles", "timers", "identity"] as const;

export default function CreateRoomPage() {
  const t = useTranslations("CreateRoom");
  const rootT = useTranslations();
  const messages = useMessages();
  const identityT = useTranslations("Identity");
  const router = useRouter();
  const { createRoom } = useGame();

  const [step, setStep] = useState(0);
  const [playerCount, setPlayerCount] = useState(DEFAULT_PLAYER_COUNT);
  const [factionPreset, setFactionPreset] = useState<RoomPreset>("default");
  const [customFactions, setCustomFactions] = useState<FactionCounts>(() =>
    defaultFactionCounts(DEFAULT_PLAYER_COUNT),
  );
  const [timerPreset, setTimerPreset] = useState<RoomPreset>("default");
  const [customTimers, setCustomTimers] = useState<PhaseDurations>(() => ({
    ...DEFAULT_PHASE_DURATIONS,
  }));
  const [name, setName] = useState("");
  const [allowComplexRoles, setAllowComplexRoles] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [roleTab, setRoleTab] = useState<RoleTab>("default");
  const [rolePool, setRolePool] = useState<RolePool>(createFullRolePool);
  const [duplicatesPreferred, setDuplicatesPreferred] = useState(false);
  const [roleCounts, setRoleCounts] = useState<Record<RoleId, number>>(
    () =>
      resolveRoleCounts({
        seats: defaultFactionCounts(DEFAULT_PLAYER_COUNT),
        pool: createFullRolePool(),
        allowDuplicates: false,
        // Deterministic first paint so SSR and hydration agree; every actual
        // shuffle or edit uses Math.random in an event handler.
        random: () => 0.5,
      }).roleCounts,
  );

  const factions =
    factionPreset === "default"
      ? defaultFactionCounts(playerCount)
      : customFactions;
  const factionErrors =
    factionPreset === "custom"
      ? validateFactionCounts(customFactions, playerCount)
      : [];
  const timerErrors =
    timerPreset === "custom" ? invalidPhaseDurations(customTimers) : [];
  const allowDuplicates =
    duplicatesPreferred || requiresDuplicates(factions, rolePool);
  const roleTotal = Object.values(roleCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const canAdvance =
    step === 0
      ? factionErrors.length === 0
      : step === 1
        ? roleTotal === playerCount
        : step === 2
          ? timerErrors.length === 0
          : true;
  const stepCopy = STEP_KEYS[step];

  function rollRoles({
    seats,
    pool = rolePool,
    duplicates = allowDuplicates,
  }: {
    seats: FactionCounts;
    pool?: RolePool;
    duplicates?: boolean;
  }) {
    const result = resolveRoleCounts({
      seats,
      pool,
      allowDuplicates:
        duplicates || requiresDuplicates(seats, pool),
    });

    setRoleCounts(result.roleCounts);
  }

  function changePlayerCount(next: number) {
    setPlayerCount(next);
    rollRoles({
      seats:
        factionPreset === "default"
          ? defaultFactionCounts(next)
          : customFactions,
    });
  }

  function changeFactionCounts(next: FactionCounts) {
    setCustomFactions(next);
    rollRoles({ seats: next });
  }

  function changeFactionPreset(next: RoomPreset) {
    let nextCustom = customFactions;
    if (next === "custom" && factionTotal(customFactions) !== playerCount) {
      nextCustom = defaultFactionCounts(playerCount);
      setCustomFactions(nextCustom);
    }
    setFactionPreset(next);
    rollRoles({
      seats:
        next === "default" ? defaultFactionCounts(playerCount) : nextCustom,
    });
  }

  function toggleRole(roleId: RoleId, enabled: boolean) {
    if (!enabled && !canDisableRole(roleId, factions, rolePool)) return;

    const nextPool = { ...rolePool, [roleId]: enabled };
    setRolePool(nextPool);
    rollRoles({ seats: factions, pool: nextPool });
  }

  function changeAllowDuplicates(enabled: boolean) {
    if (!enabled && requiresDuplicates(factions, rolePool)) return;

    setDuplicatesPreferred(enabled);
    rollRoles({ seats: factions, pool: rolePool, duplicates: enabled });
  }

  function shuffleRoles() {
    rollRoles({
      seats: factions,
      pool: rolePool,
      duplicates: allowDuplicates,
    });
  }

  function updatePhaseDuration(
    phase: keyof PhaseDurations,
    durationMs: number,
  ) {
    setCustomTimers((current) => ({ ...current, [phase]: durationMs }));
  }

  function describeError(caught: unknown): string {
    if (typeof caught === "object" && caught !== null && "messageKey" in caught) {
      const { messageKey, params } = caught as {
        messageKey?: unknown;
        params?: Record<string, string | number>;
      };
      if (typeof messageKey === "string" && hasMessage(messages, messageKey)) {
        try {
          return rootT(messageKey as string, params);
        } catch {
          // Missing params for a known key: use the local fallback instead.
        }
      }
    }

    return t("createError");
  }

  async function handlePrimary() {
    if (pending) return;

    if (step < STEP_KEYS.length - 1) {
      if (!canAdvance) return;
      setSubmitError(null);
      setStep((current) => current + 1);
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(identityT("nameRequired"));
      return;
    }
    if (trimmed.length > 20) {
      setNameError(identityT("nameTooLong"));
      return;
    }

    setNameError(null);
    setSubmitError(null);
    setPending(true);

    const config = buildRoomConfig({
      playerCount,
      factionPreset,
      factionCounts: customFactions,
      roleCounts,
      timerPreset,
      phaseDurations: customTimers,
    });

    try {
      await createRoom({ name: trimmed, allowComplexRoles, config });
      router.push("/lobby");
    } catch (caught) {
      setSubmitError(describeError(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip px-4 pb-8 pt-5">
      <div
        aria-hidden
        className="noir-atmosphere pointer-events-none absolute inset-x-0 top-0 -z-10 h-96"
      />

      <header>
        <div className="flex items-center justify-between gap-3">
          {step === 0 ? (
            <Link
              href="/"
              aria-label={t("back")}
              className="grid size-11 place-items-center rounded-full border bg-card/60 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-4" />
            </Link>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("back")}
              className="size-11 rounded-full bg-card/60"
              onClick={() => setStep((current) => current - 1)}
            >
              <ArrowLeft />
            </Button>
          )}
          <LocaleSwitcher />
        </div>

        <div className="mt-5">
          <WizardProgress
            steps={STEP_KEYS.map((key) => t(`steps.${key}`))}
            current={step}
          />
        </div>

        <div className="mt-6">
          <h1 className="font-display text-4xl leading-none tracking-tight">
            {t(`stepCopy.${stepCopy}.title`)}
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t(`stepCopy.${stepCopy}.subtitle`)}
          </p>
        </div>
      </header>

      <main className="mt-5 flex-1">
        {step === 0 ? (
          <div className="space-y-11">
            <Card className="border-border/80 bg-card/70 backdrop-blur">
              <CardContent>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-medium">{t("playersTitle")}</h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {t("playersHint", {
                        min: MIN_PLAYERS,
                        max: MAX_PLAYERS,
                      })}
                    </p>
                  </div>
                  <NumberStepper
                    value={playerCount}
                    min={MIN_PLAYERS}
                    max={MAX_PLAYERS}
                    onChange={changePlayerCount}
                    decreaseLabel={t("decreasePlayers")}
                    increaseLabel={t("increasePlayers")}
                    valueClassName="min-w-14 text-3xl"
                  />
                </div>
              </CardContent>
            </Card>

            <section className="flex flex-col gap-4">
              <div className="space-y-2">
                <h2 className="font-heading text-base leading-snug font-medium">
                  {t("factionTitle")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("factionHint")}
                </p>
              </div>
              <FactionDistribution
                preset={factionPreset}
                onPresetChange={changeFactionPreset}
                playerCount={playerCount}
                counts={factions}
                onCountsChange={changeFactionCounts}
                errors={factionErrors}
              />
            </section>
          </div>
        ) : null}

        {step === 1 ? (
          <section className="mt-8">
            <RoleSelection
              tab={roleTab}
              onTabChange={setRoleTab}
              seats={factions}
              pool={rolePool}
              onToggle={toggleRole}
              allowDuplicates={allowDuplicates}
              onAllowDuplicatesChange={changeAllowDuplicates}
              roleCounts={roleCounts}
              onShuffle={shuffleRoles}
            />
          </section>
        ) : null}

        {step === 2 ? (
          <section className="mt-8 flex flex-col gap-4">
            <div className="space-y-2">
              <h2 className="font-heading text-base leading-snug font-medium">
                {t("timersTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("timersHint")}
              </p>
            </div>
            <PhaseTimers
              preset={timerPreset}
              onPresetChange={setTimerPreset}
              durations={
                timerPreset === "default"
                  ? DEFAULT_PHASE_DURATIONS
                  : customTimers
              }
              onChange={updatePhaseDuration}
            />
          </section>
        ) : null}

        {step === 3 ? (
          <div className="space-y-10">
            <Card className="border-border/80 bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle>{t("identityTitle")}</CardTitle>
                <CardDescription>{t("identityHint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <IdentityFields
                  idPrefix="create"
                  name={name}
                  onNameChange={(value) => {
                    setName(value);
                    setNameError(null);
                    setSubmitError(null);
                  }}
                  allowComplexRoles={allowComplexRoles}
                  onAllowComplexRolesChange={setAllowComplexRoles}
                  nameError={nameError}
                />
              </CardContent>
            </Card>

            <RoomConfigSummary
              config={buildRoomConfig({
                playerCount,
                factionPreset,
                factionCounts: customFactions,
                roleCounts,
                timerPreset,
                phaseDurations: customTimers,
              })}
            />
          </div>
        ) : null}
      </main>

      <footer className="mt-5 space-y-2">
        {submitError ? (
          <Alert variant="destructive" className="p-3">
            <CircleAlert />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          type="button"
          className="h-12 w-full gap-2 text-sm"
          disabled={!canAdvance || pending}
          onClick={handlePrimary}
        >
          {step === STEP_KEYS.length - 1 ? t("create") : t("next")}
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ArrowRight className="size-4" />
          )}
        </Button>
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          {step === STEP_KEYS.length - 1 ? t("createHint") : t("stepHint")}
        </p>
      </footer>
    </div>
  );
}
