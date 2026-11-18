import type {
  ConfigurablePhase,
  EngineError,
  EngineErrorCode,
  Faction,
  RoleId,
  RoomConfig,
} from "./types";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 16;

export const ROLE_IDS = [
  "godfather",
  "consigliere",
  "framer",
  "detective",
  "doctor",
  "bodyguard",
  "roleblocker",
  "vigilante",
  "mayor",
  "villager",
  "jester",
  "executioner",
] as const satisfies readonly RoleId[];

export interface RoleMeta {
  faction: Faction;
  activeAtNight: boolean;
  nameKey: string;
  descriptionKey: string;
}

export const ROLE_META: Record<RoleId, RoleMeta> = {
  godfather: {
    faction: "mafia",
    activeAtNight: true,
    nameKey: "Roles.godfather.name",
    descriptionKey: "Roles.godfather.description",
  },
  consigliere: {
    faction: "mafia",
    activeAtNight: true,
    nameKey: "Roles.consigliere.name",
    descriptionKey: "Roles.consigliere.description",
  },
  framer: {
    faction: "mafia",
    activeAtNight: true,
    nameKey: "Roles.framer.name",
    descriptionKey: "Roles.framer.description",
  },
  detective: {
    faction: "town",
    activeAtNight: true,
    nameKey: "Roles.detective.name",
    descriptionKey: "Roles.detective.description",
  },
  doctor: {
    faction: "town",
    activeAtNight: true,
    nameKey: "Roles.doctor.name",
    descriptionKey: "Roles.doctor.description",
  },
  bodyguard: {
    faction: "town",
    activeAtNight: true,
    nameKey: "Roles.bodyguard.name",
    descriptionKey: "Roles.bodyguard.description",
  },
  roleblocker: {
    faction: "town",
    activeAtNight: true,
    nameKey: "Roles.roleblocker.name",
    descriptionKey: "Roles.roleblocker.description",
  },
  vigilante: {
    faction: "town",
    activeAtNight: true,
    nameKey: "Roles.vigilante.name",
    descriptionKey: "Roles.vigilante.description",
  },
  mayor: {
    faction: "town",
    activeAtNight: false,
    nameKey: "Roles.mayor.name",
    descriptionKey: "Roles.mayor.description",
  },
  villager: {
    faction: "town",
    activeAtNight: false,
    nameKey: "Roles.villager.name",
    descriptionKey: "Roles.villager.description",
  },
  jester: {
    faction: "neutral",
    activeAtNight: false,
    nameKey: "Roles.jester.name",
    descriptionKey: "Roles.jester.description",
  },
  executioner: {
    faction: "neutral",
    activeAtNight: false,
    nameKey: "Roles.executioner.name",
    descriptionKey: "Roles.executioner.description",
  },
};

export const PLAYER_COLORS = [
  "bg-rose-500/15 text-rose-300",
  "bg-amber-500/15 text-amber-300",
  "bg-sky-500/15 text-sky-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-violet-500/15 text-violet-300",
  "bg-orange-500/15 text-orange-300",
  "bg-teal-500/15 text-teal-300",
  "bg-fuchsia-500/15 text-fuchsia-300",
  "bg-lime-500/15 text-lime-300",
  "bg-cyan-500/15 text-cyan-300",
  "bg-indigo-500/15 text-indigo-300",
  "bg-pink-500/15 text-pink-300",
  "bg-red-500/15 text-red-300",
  "bg-blue-500/15 text-blue-300",
  "bg-yellow-500/15 text-yellow-300",
  "bg-purple-500/15 text-purple-300",
] as const;

export const MIN_PHASE_DURATION_MS = 10_000;
export const MAX_PHASE_DURATION_MS = 600_000;
export const MIN_WHISPER_BUDGET = 0;
export const MAX_WHISPER_BUDGET = 10;

export const CONFIGURABLE_PHASES: readonly ConfigurablePhase[] = [
  "roleReveal",
  "night",
  "nightReport",
  "dayDiscussion",
  "voting",
  "voteResult",
];

export const DEFAULT_PHASE_DURATIONS: Record<ConfigurablePhase, number> = {
  roleReveal: 60_000,
  night: 90_000,
  nightReport: 10_000,
  dayDiscussion: 300_000,
  voting: 60_000,
  voteResult: 10_000,
};

export function defaultRoleCountsFor(
  playerCount: number,
): Record<RoleId, number> | null {
  if (
    !Number.isInteger(playerCount) ||
    playerCount < MIN_PLAYERS ||
    playerCount > MAX_PLAYERS
  ) {
    return null;
  }

  const mafia = Math.max(1, Math.floor(playerCount / 4));
  const neutral = playerCount >= 9 ? 2 : playerCount >= 5 ? 1 : 0;
  const town = playerCount - mafia - neutral;

  const consigliere = mafia >= 3 ? 1 : 0;
  const detective = town >= 1 ? 1 : 0;
  const doctor = town >= 2 ? 1 : 0;
  const bodyguard = town >= 3 ? 1 : 0;
  const roleblocker = town >= 4 ? 1 : 0;
  const vigilante = town >= 6 ? 1 : 0;
  const mayor = town >= 7 ? 1 : 0;
  const jester = neutral >= 1 ? 1 : 0;
  const executioner = neutral >= 2 ? 1 : 0;

  return {
    godfather: 1,
    consigliere,
    framer: mafia - 1 - consigliere,
    detective,
    doctor,
    bodyguard,
    roleblocker,
    vigilante,
    mayor,
    villager:
      town - detective - doctor - bodyguard - roleblocker - vigilante - mayor,
    jester,
    executioner,
  };
}

export function createDefaultRoleCounts(): Record<RoleId, number> {
  return defaultRoleCountsFor(MIN_PLAYERS) ?? {
    godfather: 1,
    consigliere: 0,
    framer: 0,
    detective: 1,
    doctor: 1,
    bodyguard: 0,
    roleblocker: 0,
    vigilante: 0,
    mayor: 0,
    villager: 0,
    jester: 0,
    executioner: 0,
  };
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  rolePreset: "default",
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  roleCounts: createDefaultRoleCounts(),
  phaseDurations: { ...DEFAULT_PHASE_DURATIONS },
  whisperBudget: 3,
  tieRule: "no-elimination",
  revealRoleOnVote: true,
};

export function cloneRoleCounts(
  roleCounts: Record<RoleId, number>,
): Record<RoleId, number> {
  return {
    godfather: roleCounts.godfather,
    consigliere: roleCounts.consigliere,
    framer: roleCounts.framer,
    detective: roleCounts.detective,
    doctor: roleCounts.doctor,
    bodyguard: roleCounts.bodyguard,
    roleblocker: roleCounts.roleblocker,
    vigilante: roleCounts.vigilante,
    mayor: roleCounts.mayor,
    villager: roleCounts.villager,
    jester: roleCounts.jester,
    executioner: roleCounts.executioner,
  };
}

export function clonePhaseDurations(
  phaseDurations: Record<ConfigurablePhase, number>,
): Record<ConfigurablePhase, number> {
  return {
    roleReveal: phaseDurations.roleReveal,
    night: phaseDurations.night,
    nightReport: phaseDurations.nightReport,
    dayDiscussion: phaseDurations.dayDiscussion,
    voting: phaseDurations.voting,
    voteResult: phaseDurations.voteResult,
  };
}

export function cloneRoomConfig(config: RoomConfig): RoomConfig {
  return {
    rolePreset: config.rolePreset,
    minPlayers: config.minPlayers,
    maxPlayers: config.maxPlayers,
    roleCounts: cloneRoleCounts(config.roleCounts),
    phaseDurations: clonePhaseDurations(config.phaseDurations),
    whisperBudget: config.whisperBudget,
    tieRule: config.tieRule,
    revealRoleOnVote: config.revealRoleOnVote,
  };
}

export interface ValidateConfigOptions {
  stage: "create" | "start";
  playerCount: number;
}

function configError(
  code: EngineErrorCode,
  messageKey: string,
  params?: Record<string, string | number>,
): EngineError {
  return params ? { code, messageKey, params } : { code, messageKey };
}

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

function sumRoleCounts(roleCounts: Record<RoleId, number>): number {
  return ROLE_IDS.reduce((total, roleId) => total + roleCounts[roleId], 0);
}

export function validateConfig(
  config: RoomConfig,
  opts: ValidateConfigOptions,
): EngineError | null {
  if (config.rolePreset !== "default" && config.rolePreset !== "custom") {
    return configError("INVALID_CONFIG", "Errors.invalidConfig", {
      reason: "rolePreset",
    });
  }

  if (
    !isInteger(config.minPlayers) ||
    !isInteger(config.maxPlayers) ||
    config.minPlayers < MIN_PLAYERS ||
    config.maxPlayers > MAX_PLAYERS ||
    config.minPlayers > config.maxPlayers
  ) {
    return configError("INVALID_CONFIG", "Errors.invalidConfig", {
      reason: "playerLimits",
    });
  }

  for (const roleId of ROLE_IDS) {
    const count = config.roleCounts[roleId];
    if (!isInteger(count) || count < 0) {
      return configError("INVALID_CONFIG", "Errors.invalidConfig", {
        reason: "roleCounts",
        role: roleId,
      });
    }
  }

  const mafia =
    config.roleCounts.godfather +
    config.roleCounts.consigliere +
    config.roleCounts.framer;
  if (mafia < 1) {
    return configError("INVALID_CONFIG", "Errors.invalidConfig", {
      reason: "noMafia",
    });
  }
  // Every role except the Godfather may appear more than once in a custom
  // room. The wizard decides how many copies are used.
  if (config.roleCounts.godfather !== 1) {
    return configError("INVALID_CONFIG", "Errors.invalidConfig", {
      reason: "godfatherCount",
    });
  }

  const town =
    config.roleCounts.villager +
    config.roleCounts.detective +
    config.roleCounts.doctor +
    config.roleCounts.bodyguard +
    config.roleCounts.roleblocker +
    config.roleCounts.vigilante +
    config.roleCounts.mayor;
  if (town < 1) {
    return configError("INVALID_CONFIG", "Errors.invalidConfig", {
      reason: "noTown",
    });
  }

  for (const phase of CONFIGURABLE_PHASES) {
    const duration = config.phaseDurations[phase];
    if (
      !Number.isFinite(duration) ||
      !isInteger(duration) ||
      duration < MIN_PHASE_DURATION_MS ||
      duration > MAX_PHASE_DURATION_MS
    ) {
      return configError("INVALID_CONFIG", "Errors.invalidConfig", {
        reason: "duration",
        phase,
      });
    }
  }

  if (
    !isInteger(config.whisperBudget) ||
    config.whisperBudget < MIN_WHISPER_BUDGET ||
    config.whisperBudget > MAX_WHISPER_BUDGET
  ) {
    return configError("INVALID_CONFIG", "Errors.invalidConfig", {
      reason: "whisperBudget",
    });
  }

  if (
    config.tieRule !== "no-elimination" &&
    config.tieRule !== "random" &&
    config.tieRule !== "revote"
  ) {
    return configError("INVALID_CONFIG", "Errors.invalidConfig", {
      reason: "tieRule",
    });
  }

  if (typeof config.revealRoleOnVote !== "boolean") {
    return configError("INVALID_CONFIG", "Errors.invalidConfig", {
      reason: "revealRoleOnVote",
    });
  }

  if (opts.stage === "start") {
    if (!isInteger(opts.playerCount) || opts.playerCount < config.minPlayers) {
      return configError(
        "NOT_ENOUGH_PLAYERS",
        "Errors.notEnoughPlayers",
        { min: config.minPlayers, actual: opts.playerCount },
      );
    }
    if (opts.playerCount > config.maxPlayers) {
      return configError("TOO_MANY_PLAYERS", "Errors.tooManyPlayers", {
        max: config.maxPlayers,
        actual: opts.playerCount,
      });
    }

    const total = sumRoleCounts(config.roleCounts);
    if (total !== opts.playerCount) {
      return configError("ROLE_COUNT_MISMATCH", "Errors.roleCountMismatch", {
        expected: opts.playerCount,
        actual: total,
      });
    }
  }

  return null;
}
