import type {
  ConfigurablePhase,
  Faction,
  FactionCounts,
  PhaseDurations,
  RoomConfig,
  RoleId,
} from "./types";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 16;
export const DEFAULT_PLAYER_COUNT = 12;

export const MIN_PHASE_SECONDS = 10;
export const MAX_PHASE_SECONDS = 600;

export const PHASE_KEYS: ConfigurablePhase[] = [
  "roleReveal",
  "night",
  "nightReport",
  "dayDiscussion",
  "voting",
  "voteResult",
];

export const DEFAULT_PHASE_DURATIONS: PhaseDurations = {
  roleReveal: 60_000,
  night: 90_000,
  nightReport: 10_000,
  dayDiscussion: 300_000,
  voting: 60_000,
  voteResult: 10_000,
};

export type FactionError = "sum" | "mafia" | "town" | "neutral";

export function defaultFactionCounts(playerCount: number): FactionCounts {
  const mafia = Math.max(1, Math.floor(playerCount / 4));
  const neutral = playerCount >= 9 ? 2 : playerCount >= 5 ? 1 : 0;
  const town = Math.max(1, playerCount - mafia - neutral);

  return { mafia, town, neutral };
}

export function deriveRoleCounts(
  factions: FactionCounts,
): Record<RoleId, number> {
  const consigliere = factions.mafia >= 3 ? 1 : 0;
  const detective = factions.town >= 1 ? 1 : 0;
  const doctor = factions.town >= 2 ? 1 : 0;
  const bodyguard = factions.town >= 3 ? 1 : 0;
  const roleblocker = factions.town >= 4 ? 1 : 0;
  const vigilante = factions.town >= 6 ? 1 : 0;
  const mayor = factions.town >= 7 ? 1 : 0;
  const jester = factions.neutral >= 1 ? 1 : 0;
  const executioner = factions.neutral >= 2 ? 1 : 0;

  return {
    godfather: factions.mafia >= 1 ? 1 : 0,
    consigliere,
    framer: Math.max(0, factions.mafia - 1 - consigliere),
    detective,
    doctor,
    bodyguard,
    roleblocker,
    vigilante,
    mayor,
    villager: Math.max(
      0,
      factions.town -
        detective -
        doctor -
        bodyguard -
        roleblocker -
        vigilante -
        mayor,
    ),
    jester,
    executioner,
  };
}

export function factionTotal(factions: FactionCounts): number {
  return factions.mafia + factions.town + factions.neutral;
}

export function validateFactionCounts(
  factions: FactionCounts,
  playerCount: number,
): FactionError[] {
  const errors: FactionError[] = [];

  if (factions.mafia < 1) errors.push("mafia");
  if (factions.town < 1) errors.push("town");
  if (factions.neutral > 2) errors.push("neutral");
  if (factionTotal(factions) !== playerCount) errors.push("sum");

  return errors;
}

export function invalidPhaseDurations(
  durations: PhaseDurations,
): ConfigurablePhase[] {
  return PHASE_KEYS.filter(
    (phase) =>
      !Number.isFinite(durations[phase]) ||
      durations[phase] < MIN_PHASE_SECONDS * 1000 ||
      durations[phase] > MAX_PHASE_SECONDS * 1000,
  );
}

export function buildRoomConfig({
  playerCount,
  factionPreset,
  factionCounts,
  roleCounts,
  timerPreset,
  phaseDurations,
}: {
  playerCount: number;
  factionPreset: RoomConfig["factionPreset"];
  factionCounts: FactionCounts;
  roleCounts?: Record<RoleId, number>;
  timerPreset: RoomConfig["timerPreset"];
  phaseDurations: PhaseDurations;
}): RoomConfig {
  const resolvedFactions =
    factionPreset === "default"
      ? defaultFactionCounts(playerCount)
      : factionCounts;

  return {
    playerCount,
    factionPreset,
    factionCounts: { ...resolvedFactions },
    roleCounts: roleCounts
      ? { ...roleCounts }
      : deriveRoleCounts(resolvedFactions),
    timerPreset,
    phaseDurations:
      timerPreset === "default"
        ? { ...DEFAULT_PHASE_DURATIONS }
        : { ...phaseDurations },
  };
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = buildRoomConfig({
  playerCount: DEFAULT_PLAYER_COUNT,
  factionPreset: "default",
  factionCounts: defaultFactionCounts(DEFAULT_PLAYER_COUNT),
  timerPreset: "default",
  phaseDurations: DEFAULT_PHASE_DURATIONS,
});

export function cloneRoomConfig(config: RoomConfig): RoomConfig {
  return {
    ...config,
    factionCounts: { ...config.factionCounts },
    roleCounts: { ...config.roleCounts },
    phaseDurations: { ...config.phaseDurations },
  };
}

const CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateRoomCode(): string {
  let code = "";

  for (let index = 0; index < 5; index += 1) {
    code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  }

  return code;
}

export function formatPhaseDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : `${seconds}s`;
}

export const FACTION_KEYS: Faction[] = ["mafia", "town", "neutral"];
