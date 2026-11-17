import {
  MIN_PLAYERS,
  PLAYER_COLORS,
  ROLE_IDS,
  ROLE_META,
  cloneRoomConfig,
  createDefaultRoleCounts,
  defaultRoleCountsFor,
  validateConfig,
} from "./config";
import { createRng, pickRandom, shuffle } from "./random";
import { allowedActionKinds, canFramerKill } from "./roles";
import type {
  Command,
  EliminationCause,
  EngineError,
  EngineErrorCode,
  GameAlert,
  NightAction,
  NightResult,
  PlayerId,
  ReduceResult,
  RoleId,
  RoomCode,
  RoomConfig,
  RoomState,
  ServerPlayer,
  Winner,
} from "./types";

export interface CreateRoomStateInput {
  code: RoomCode;
  hostId: PlayerId;
  hostName: string;
  hostTokenHash: string;
  seed: number;
  now: number;
  config: RoomConfig;
}

export type AddPlayerResult =
  | { ok: true; state: RoomState }
  | { ok: false; error: EngineError };

type AlertInput = Omit<GameAlert, "id" | "at">;

interface SubmittedAction {
  actor: ServerPlayer;
  action: NightAction;
}

export function engineError(
  code: EngineErrorCode,
  messageKey: string,
  params?: Record<string, string | number>,
): EngineError {
  return params ? { code, messageKey, params } : { code, messageKey };
}

function failure(
  code: EngineErrorCode,
  messageKey: string,
  params?: Record<string, string | number>,
): { ok: false; error: EngineError } {
  return { ok: false, error: engineError(code, messageKey, params) };
}

const NAME_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const MAX_NAME_LENGTH = 20;
const MAX_TEXT_LENGTH = 500;

function cleanName(value: string): string {
  return value.replace(NAME_CONTROL_CHARACTERS, "").trim();
}

function cleanText(value: string): string {
  return value.trim();
}

function comparePlayers(first: ServerPlayer, second: ServerPlayer): number {
  if (first.joinedAt !== second.joinedAt) {
    return first.joinedAt - second.joinedAt;
  }
  if (first.id === second.id) {
    return 0;
  }
  return first.id < second.id ? -1 : 1;
}

function playerName(state: RoomState, playerId: PlayerId): string {
  return state.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function chooseColor(players: readonly ServerPlayer[], requested?: string): string {
  if (requested) {
    return requested;
  }

  const used = new Set(players.map((player) => player.color));
  const unused = PLAYER_COLORS.find((color) => !used.has(color));
  if (unused) {
    return unused;
  }

  return PLAYER_COLORS[players.length % PLAYER_COLORS.length];
}

function zeroWhisperBudget(players: readonly ServerPlayer[]): Record<PlayerId, number> {
  const budget: Record<PlayerId, number> = {};
  for (const player of players) {
    budget[player.id] = 0;
  }
  return budget;
}

function normalizeConfig(config: RoomConfig, playerCount: number): RoomConfig {
  const normalized = cloneRoomConfig(config);

  if (normalized.rolePreset === "default") {
    normalized.roleCounts =
      defaultRoleCountsFor(playerCount) ?? createDefaultRoleCounts();
  }

  return normalized;
}

function addAlert(
  state: RoomState,
  playerId: PlayerId,
  alert: AlertInput,
  now: number,
): void {
  const alerts = state.alertsByPlayer[playerId] ?? [];
  state.alertsByPlayer[playerId] = alerts;
  alerts.push({
    ...alert,
    id: `alert:${state.round}:${playerId}:${alerts.length + 1}`,
    at: now,
  });
}

function addAlertToAllPlayers(
  state: RoomState,
  alert: AlertInput,
  now: number,
): void {
  for (const player of state.players) {
    addAlert(state, player.id, alert, now);
  }
}

function enterPhase(state: RoomState, phase: RoomState["phase"], now: number): void {
  state.phase = phase;
  state.readyIds = [];

  if (phase === "lobby" || phase === "gameOver") {
    state.phaseEndsAt = null;
  } else {
    state.phaseEndsAt = now + state.config.phaseDurations[phase];
  }

  switch (phase) {
    case "roleReveal":
      break;
    case "night":
      state.nightActions = {};
      state.votes = {};
      state.voteTally = null;
      state.revoteUsed = false;
      state.revoteCandidates = null;
      state.pendingNightResult = null;
      break;
    case "nightReport":
      state.nightActions = {};
      state.votes = {};
      break;
    case "dayDiscussion":
      state.votes = {};
      state.voteTally = null;
      state.revoteUsed = false;
      state.revoteCandidates = null;
      state.whispersSentThisDay = zeroWhisperBudget(state.players);
      break;
    case "voting":
      state.votes = {};
      state.voteTally = null;
      state.revoteUsed = false;
      state.revoteCandidates = null;
      break;
    case "voteResult":
      break;
    case "gameOver":
      break;
    case "lobby":
      break;
  }
}

function allLivingReady(state: RoomState): boolean {
  const living = state.players.filter((player) => player.alive);
  if (living.length === 0) {
    return false;
  }
  const ready = new Set(state.readyIds);
  return living.every((player) => ready.has(player.id));
}

function allLivingVoted(state: RoomState): boolean {
  const living = state.players.filter((player) => player.alive);
  if (living.length === 0) {
    return false;
  }
  return living.every((player) => state.votes[player.id] != null);
}

function maybeAutoAdvance(state: RoomState, now: number): void {
  if (state.phase === "voting") {
    if (allLivingVoted(state)) {
      advancePhaseMutable(state, now);
    }
    return;
  }

  if (state.phase === "lobby" || state.phase === "gameOver") {
    return;
  }

  if (allLivingReady(state)) {
    advancePhaseMutable(state, now);
  }
}

function assignRoles(state: RoomState): EngineError | null {
  const expectedPlayers = state.players.length;
  const totalRoles = ROLE_IDS.reduce(
    (total, roleId) => total + state.config.roleCounts[roleId],
    0,
  );

  if (totalRoles !== expectedPlayers) {
    return engineError("ROLE_COUNT_MISMATCH", "Errors.roleCountMismatch", {
      expected: expectedPlayers,
      actual: totalRoles,
    });
  }

  const rng = createRng(state.seed);
  const ids = state.players.map((player) => player.id);
  const orderedIds = shuffle(rng, ids);
  const roleBag: RoleId[] = [];
  for (const roleId of ROLE_IDS) {
    for (let count = 0; count < state.config.roleCounts[roleId]; count += 1) {
      roleBag.push(roleId);
    }
  }

  const playersById = new Map(
    state.players.map((player) => [player.id, player] as const),
  );

  orderedIds.forEach((id, index) => {
    const player = playersById.get(id);
    const roleId = roleBag[index];
    if (!player || !roleId) {
      return;
    }
    player.roleId = roleId;
    player.faction = ROLE_META[roleId].faction;
    player.alive = true;
    delete player.eliminatedAt;
  });

  state.seed = rng.state >>> 0;
  return null;
}

function detectWinner(
  state: RoomState,
  cause: EliminationCause,
  eliminatedPlayers: readonly ServerPlayer[],
): Winner | null {
  if (cause === "vote") {
    const jester = eliminatedPlayers.find((player) => player.roleId === "jester");
    if (jester) {
      return { faction: "neutral", playerId: jester.id, reason: "jester" };
    }
  }

  const living = state.players.filter((player) => player.alive);
  const livingMafia = living.filter((player) => player.faction === "mafia").length;
  const livingNonMafia = living.length - livingMafia;

  if (livingMafia === 0) {
    return { faction: "town" };
  }
  if (livingMafia >= livingNonMafia) {
    return { faction: "mafia" };
  }

  return null;
}

function announceWinner(state: RoomState, now: number): void {
  if (!state.winner) {
    return;
  }

  const detailKey =
    state.winner.faction === "neutral"
      ? "Alerts.win.jester"
      : `Alerts.win.${state.winner.faction}`;
  const params =
    state.winner.faction === "neutral"
      ? { player: playerName(state, state.winner.playerId) }
      : undefined;

  addAlertToAllPlayers(
    state,
    {
      kind: "win",
      round: state.round,
      titleKey: "Alerts.win.title",
      detailKey,
      params,
    },
    now,
  );
}

function eliminatePlayer(
  state: RoomState,
  playerId: PlayerId,
  cause: EliminationCause,
): ServerPlayer | undefined {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || !player.alive) {
    return undefined;
  }

  player.alive = false;
  player.eliminatedAt = {
    phase: state.phase,
    round: state.round,
    cause,
  };
  state.eliminatedIds.push(player.id);

  return player;
}

function authorisedKillActor(state: RoomState, actor: ServerPlayer): boolean {
  if (!actor.alive) {
    return false;
  }
  if (actor.roleId === "godfather") {
    return true;
  }
  if (actor.roleId === "framer") {
    return canFramerKill(state.players, actor.id);
  }
  return false;
}

function latestSubmitted(
  actions: readonly SubmittedAction[],
): SubmittedAction | undefined {
  if (actions.length === 0) {
    return undefined;
  }

  const sorted = [...actions].sort((first, second) => {
    if (first.action.submittedAt !== second.action.submittedAt) {
      return first.action.submittedAt - second.action.submittedAt;
    }
    return comparePlayers(first.actor, second.actor);
  });

  return sorted[sorted.length - 1];
}

function investigationResult(
  target: ServerPlayer,
  framedTargets: ReadonlySet<PlayerId>,
): "mafia" | "not-mafia" {
  if (target.roleId === "godfather") {
    return "not-mafia";
  }
  if (framedTargets.has(target.id)) {
    return "mafia";
  }
  return target.faction === "mafia" ? "mafia" : "not-mafia";
}

function resolveNight(state: RoomState, now: number): NightResult {
  const submitted: SubmittedAction[] = [];
  for (const player of state.players) {
    const action = state.nightActions[player.id];
    if (action && player.alive) {
      submitted.push({ actor: player, action });
    }
  }

  const kill = latestSubmitted(
    submitted.filter(
      (entry) => entry.action.kind === "kill" && authorisedKillActor(state, entry.actor),
    ),
  );
  const protect = latestSubmitted(
    submitted.filter((entry) => entry.action.kind === "protect"),
  );
  const frames = submitted.filter((entry) => entry.action.kind === "frame");
  const investigations = submitted.filter(
    (entry) => entry.action.kind === "investigate",
  );

  const killTarget = kill
    ? state.players.find(
        (player) => player.id === kill.action.targetId && player.alive,
      )
    : undefined;
  const protectedTargetId = protect?.action.targetId;

  const deaths: PlayerId[] = [];
  const saved: PlayerId[] = [];

  if (killTarget) {
    if (killTarget.id === protectedTargetId) {
      saved.push(killTarget.id);
    } else {
      deaths.push(killTarget.id);
    }
  }

  const framedTargets = new Set(
    frames.map((entry) => entry.action.targetId),
  );
  const investigationResults: NightResult["investigations"] = {};

  for (const entry of investigations) {
    const target = state.players.find(
      (player) => player.id === entry.action.targetId,
    );
    if (target) {
      investigationResults[entry.actor.id] = investigationResult(
        target,
        framedTargets,
      );
    }
  }

  const result: NightResult = {
    deaths,
    saved,
    investigations: investigationResults,
  };
  state.pendingNightResult = result;

  const eliminatedPlayers: ServerPlayer[] = [];
  for (const playerId of deaths) {
    const eliminated = eliminatePlayer(state, playerId, "night");
    if (eliminated) {
      eliminatedPlayers.push(eliminated);
    }
  }

  const deathDetailKey =
    deaths.length > 0 ? "Alerts.killed.body" : "Alerts.killed.noDeaths";
  const deathParams =
    deaths.length > 0
      ? { player: playerName(state, deaths[0]) }
      : undefined;

  addAlertToAllPlayers(
    state,
    {
      kind: "kill",
      round: state.round,
      titleKey: "Alerts.killed.title",
      detailKey: deathDetailKey,
      params: deathParams,
    },
    now,
  );

  if (protect && saved.length > 0) {
    addAlert(
      state,
      protect.actor.id,
      {
        kind: "saved",
        round: state.round,
        titleKey: "Alerts.saved.title",
        detailKey: "Alerts.saved.body",
        params: { player: playerName(state, saved[0]) },
      },
      now,
    );
  }

  for (const entry of investigations) {
    const target = state.players.find(
      (player) => player.id === entry.action.targetId,
    );
    if (!target) {
      continue;
    }
    const outcome = investigationResult(target, framedTargets);
    addAlert(
      state,
      entry.actor.id,
      {
        kind: "investigation",
        round: state.round,
        titleKey: "Alerts.investigation.title",
        detailKey:
          outcome === "mafia"
            ? "Alerts.investigation.mafia"
            : "Alerts.investigation.notMafia",
        params: { player: target.name },
      },
      now,
    );
  }

  if (kill) {
    for (const player of state.players) {
      if (player.faction !== "mafia") {
        continue;
      }
      addAlert(
        state,
        player.id,
        {
          kind: "kill",
          round: state.round,
          titleKey: "Alerts.kill.title",
          detailKey:
            deaths.length > 0 ? "Alerts.kill.success" : "Alerts.kill.saved",
          params: {
            player: killTarget ? killTarget.name : playerName(state, kill.action.targetId),
          },
        },
        now,
      );
    }
  }

  state.winner = detectWinner(state, "night", eliminatedPlayers);
  if (state.winner) {
    announceWinner(state, now);
  }

  return result;
}

function addVoteAlert(
  state: RoomState,
  eliminated: ServerPlayer | undefined,
  now: number,
): void {
  addAlertToAllPlayers(
    state,
    {
      kind: "vote",
      round: state.round,
      titleKey: "Alerts.vote.title",
      detailKey: eliminated
        ? "Alerts.vote.eliminated"
        : "Alerts.vote.tie",
      params: eliminated ? { player: eliminated.name } : undefined,
    },
    now,
  );
}

function resolveVoting(state: RoomState, now: number): boolean {
  const tally: Record<PlayerId, number> = {};
  for (const player of state.players) {
    if (!player.alive) {
      continue;
    }
    const targetId = state.votes[player.id];
    if (!targetId) {
      continue;
    }
    tally[targetId] = (tally[targetId] ?? 0) + 1;
  }
  state.voteTally = tally;

  const entries = Object.entries(tally);
  if (entries.length === 0) {
    addVoteAlert(state, undefined, now);
    enterPhase(state, "voteResult", now);
    return true;
  }

  const highest = Math.max(...entries.map(([, count]) => count));
  const tied = entries
    .filter(([, count]) => count === highest)
    .map(([playerId]) => playerId)
    .sort((firstId, secondId) => {
      const first = state.players.find((player) => player.id === firstId);
      const second = state.players.find((player) => player.id === secondId);
      if (first && second) {
        return comparePlayers(first, second);
      }
      if (firstId === secondId) {
        return 0;
      }
      return firstId < secondId ? -1 : 1;
    });

  let eliminated: ServerPlayer | undefined;

  if (tied.length === 1) {
    eliminated = eliminatePlayer(state, tied[0], "vote");
  } else if (state.config.tieRule === "random") {
    const rng = createRng(state.seed);
    const pickedId = pickRandom(rng, tied);
    state.seed = rng.state >>> 0;
    if (pickedId) {
      eliminated = eliminatePlayer(state, pickedId, "vote");
    }
  } else if (
    state.config.tieRule === "revote" &&
    !state.revoteUsed
  ) {
    state.revoteUsed = true;
    state.revoteCandidates = [...tied];
    state.votes = {};
    state.readyIds = [];
    state.phaseEndsAt = now + state.config.phaseDurations.voting;
    addVoteAlert(state, undefined, now);
    return true;
  }

  addVoteAlert(state, eliminated, now);

  if (eliminated) {
    state.winner = detectWinner(state, "vote", [eliminated]);
    if (state.winner) {
      announceWinner(state, now);
    }
  }

  enterPhase(state, "voteResult", now);
  return true;
}

function advancePhaseMutable(state: RoomState, now: number): boolean {
  switch (state.phase) {
    case "lobby":
    case "gameOver":
      return false;
    case "roleReveal":
      enterPhase(state, "night", now);
      return true;
    case "night":
      resolveNight(state, now);
      enterPhase(state, "nightReport", now);
      return true;
    case "nightReport":
      if (state.winner) {
        enterPhase(state, "gameOver", now);
      } else {
        enterPhase(state, "dayDiscussion", now);
      }
      return true;
    case "dayDiscussion":
      enterPhase(state, "voting", now);
      return true;
    case "voting":
      return resolveVoting(state, now);
    case "voteResult":
      if (state.winner) {
        enterPhase(state, "gameOver", now);
      } else {
        state.round += 1;
        enterPhase(state, "night", now);
      }
      return true;
  }
}

function removePlayerInPlace(state: RoomState, playerId: PlayerId): boolean {
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index < 0) {
    return false;
  }

  state.players.splice(index, 1);
  state.readyIds = state.readyIds.filter((id) => id !== playerId);
  delete state.nightActions[playerId];
  delete state.votes[playerId];
  delete state.whispersSentThisDay[playerId];
  delete state.alertsByPlayer[playerId];
  state.whispers = state.whispers.filter(
    (thread) => !thread.participantIds.includes(playerId),
  );

  if (state.players.length === 0) {
    return true;
  }

  if (state.hostId === playerId) {
    const nextHost = [...state.players].sort(comparePlayers)[0];
    state.hostId = nextHost.id;
  }

  if (state.config.rolePreset === "default") {
    const counts = defaultRoleCountsFor(state.players.length);
    if (counts) {
      state.config.roleCounts = counts;
    }
  }

  return true;
}

export function createRoomState(input: CreateRoomStateInput): RoomState {
  const name = cleanName(input.hostName);
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    throw new Error("Host name must be between 1 and 20 characters.");
  }

  const config = normalizeConfig(input.config, 1);
  const host: ServerPlayer = {
    id: input.hostId,
    tokenHash: input.hostTokenHash,
    name,
    roleId: "villager",
    faction: "town",
    alive: true,
    connected: true,
    joinedAt: input.now,
    color: PLAYER_COLORS[0],
  };

  return {
    schemaVersion: 1,
    code: input.code,
    hostId: input.hostId,
    phase: "lobby",
    round: 1,
    phaseEndsAt: null,
    createdAt: input.now,
    updatedAt: input.now,
    version: 1,
    seed: input.seed >>> 0,
    config,
    players: [host],
    readyIds: [],
    nightActions: {},
    votes: {},
    voteTally: null,
    revoteUsed: false,
    revoteCandidates: null,
    eliminatedIds: [],
    winner: null,
    whispers: [],
    whispersSentThisDay: { [input.hostId]: 0 },
    graveyard: [],
    alertsByPlayer: { [input.hostId]: [] },
    pendingNightResult: null,
  };
}

export function addPlayer(
  state: RoomState,
  input: {
    id: PlayerId;
    name: string;
    tokenHash: string;
    now: number;
    color?: string;
  },
): AddPlayerResult {
  if (state.phase !== "lobby") {
    return failure("GAME_STARTED", "Errors.gameStarted");
  }

  const name = cleanName(input.name);
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    return failure("INVALID_NAME", "Errors.invalidName", {
      min: 1,
      max: MAX_NAME_LENGTH,
    });
  }

  if (state.players.length >= state.config.maxPlayers) {
    return failure("ROOM_FULL", "Errors.roomFull", {
      max: state.config.maxPlayers,
    });
  }

  if (state.players.some((player) => player.id === input.id)) {
    return failure("PLAYER_EXISTS", "Errors.playerExists");
  }

  const normalized = name.toLowerCase();
  if (
    state.players.some(
      (player) => player.name.toLowerCase() === normalized,
    )
  ) {
    return failure("NAME_TAKEN", "Errors.nameTaken", { name });
  }

  const next = structuredClone(state);
  const player: ServerPlayer = {
    id: input.id,
    tokenHash: input.tokenHash,
    name,
    roleId: "villager",
    faction: "town",
    alive: true,
    connected: true,
    joinedAt: input.now,
    color: chooseColor(next.players, input.color),
  };

  next.players.push(player);
  next.alertsByPlayer[player.id] = [];
  next.whispersSentThisDay[player.id] = 0;

  if (next.config.rolePreset === "default") {
    const counts = defaultRoleCountsFor(next.players.length);
    if (counts) {
      next.config.roleCounts = counts;
    }
  }

  next.version += 1;
  next.updatedAt = input.now;

  return { ok: true, state: next };
}

export function removePlayer(
  state: RoomState,
  playerId: PlayerId,
  now: number,
): RoomState | null {
  if (state.phase !== "lobby") {
    return structuredClone(state);
  }

  if (!state.players.some((player) => player.id === playerId)) {
    return structuredClone(state);
  }

  if (state.players.length === 1) {
    return null;
  }

  const next = structuredClone(state);
  removePlayerInPlace(next, playerId);
  next.version += 1;
  next.updatedAt = now;

  return next;
}

export function canStartGame(state: RoomState): boolean {
  if (state.phase !== "lobby") {
    return false;
  }

  const playerCount = state.players.length;
  if (
    playerCount < state.config.minPlayers ||
    playerCount > state.config.maxPlayers
  ) {
    return false;
  }

  const config = cloneRoomConfig(state.config);
  if (config.rolePreset === "default") {
    const counts = defaultRoleCountsFor(playerCount);
    if (!counts) {
      return false;
    }
    config.roleCounts = counts;
  }

  return validateConfig(config, { stage: "start", playerCount }) === null;
}

function handleSetReady(
  state: RoomState,
  playerId: PlayerId,
): EngineError | null {
  if (
    state.phase !== "roleReveal" &&
    state.phase !== "night" &&
    state.phase !== "nightReport" &&
    state.phase !== "dayDiscussion" &&
    state.phase !== "voteResult"
  ) {
    return engineError("WRONG_PHASE", "Errors.wrongPhase", {
      phase: state.phase,
    });
  }

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || !player.alive) {
    return engineError("NOT_ALIVE", "Errors.notAlive");
  }

  if (!state.readyIds.includes(player.id)) {
    state.readyIds.push(player.id);
  }

  return null;
}

function handleUnsetReady(
  state: RoomState,
  playerId: PlayerId,
): EngineError | null {
  if (state.phase === "lobby" || state.phase === "gameOver") {
    return engineError("WRONG_PHASE", "Errors.wrongPhase", {
      phase: state.phase,
    });
  }

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || !player.alive) {
    return engineError("NOT_ALIVE", "Errors.notAlive");
  }

  state.readyIds = state.readyIds.filter((id) => id !== player.id);

  if (state.phase === "night") {
    delete state.nightActions[player.id];
  }
  if (state.phase === "voting") {
    delete state.votes[player.id];
  }

  return null;
}

function handleStartGame(
  state: RoomState,
  playerId: PlayerId,
  now: number,
): EngineError | null {
  if (state.hostId !== playerId) {
    return engineError("NOT_HOST", "Errors.notHost");
  }
  if (state.phase !== "lobby") {
    return engineError("WRONG_PHASE", "Errors.wrongPhase", {
      phase: state.phase,
    });
  }

  const playerCount = state.players.length;
  if (playerCount < state.config.minPlayers) {
    return engineError("NOT_ENOUGH_PLAYERS", "Errors.notEnoughPlayers", {
      min: state.config.minPlayers,
      actual: playerCount,
    });
  }
  if (playerCount > state.config.maxPlayers) {
    return engineError("TOO_MANY_PLAYERS", "Errors.tooManyPlayers", {
      max: state.config.maxPlayers,
      actual: playerCount,
    });
  }

  const config = cloneRoomConfig(state.config);
  if (config.rolePreset === "default") {
    const counts = defaultRoleCountsFor(playerCount);
    if (!counts) {
      return engineError("NOT_ENOUGH_PLAYERS", "Errors.notEnoughPlayers", {
        min: MIN_PLAYERS,
        actual: playerCount,
      });
    }
    config.roleCounts = counts;
  }

  const validation = validateConfig(config, {
    stage: "start",
    playerCount,
  });
  if (validation) {
    return validation;
  }

  state.config = config;
  state.round = 1;
  state.readyIds = [];
  state.nightActions = {};
  state.votes = {};
  state.voteTally = null;
  state.revoteUsed = false;
  state.revoteCandidates = null;
  state.eliminatedIds = [];
  state.winner = null;
  state.whispers = [];
  state.whispersSentThisDay = zeroWhisperBudget(state.players);
  state.graveyard = [];
  state.pendingNightResult = null;
  state.alertsByPlayer = Object.fromEntries(
    state.players.map((player) => [player.id, []] as const),
  );

  const assignError = assignRoles(state);
  if (assignError) {
    return assignError;
  }

  enterPhase(state, "roleReveal", now);
  return null;
}

function handleSubmitNightAction(
  state: RoomState,
  playerId: PlayerId,
  command: Extract<Command, { type: "submitNightAction" }>,
  now: number,
): EngineError | null {
  if (state.phase !== "night") {
    return engineError("WRONG_PHASE", "Errors.wrongPhase", {
      phase: state.phase,
    });
  }

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || !player.alive) {
    return engineError("NOT_ALIVE", "Errors.notAlive");
  }

  const framerCanKill =
    player.roleId === "framer" &&
    canFramerKill(state.players, player.id);
  const allowed = allowedActionKinds(player.roleId, framerCanKill);

  if (!allowed.includes(command.kind)) {
    if (player.faction === "mafia" && command.kind === "kill") {
      return engineError("NOT_AUTHORISED", "Errors.notAuthorised");
    }
    return engineError("NOT_YOUR_TURN", "Errors.notYourTurn");
  }

  const target = state.players.find(
    (candidate) => candidate.id === command.targetId,
  );
  if (!target || !target.alive || target.id === player.id) {
    return engineError("INVALID_TARGET", "Errors.invalidTarget");
  }

  state.nightActions[player.id] = {
    kind: command.kind,
    targetId: target.id,
    submittedAt: now,
  };

  if (!state.readyIds.includes(player.id)) {
    state.readyIds.push(player.id);
  }

  return null;
}

function handleCastVote(
  state: RoomState,
  playerId: PlayerId,
  targetId: PlayerId,
): EngineError | null {
  if (state.phase !== "voting") {
    return engineError("WRONG_PHASE", "Errors.wrongPhase", {
      phase: state.phase,
    });
  }

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || !player.alive) {
    return engineError("NOT_ALIVE", "Errors.notAlive");
  }

  const target = state.players.find((candidate) => candidate.id === targetId);
  if (!target || !target.alive || target.id === player.id) {
    return engineError("INVALID_TARGET", "Errors.invalidTarget");
  }

  if (
    state.revoteCandidates &&
    !state.revoteCandidates.includes(target.id)
  ) {
    return engineError("INVALID_TARGET", "Errors.invalidTarget", {
      reason: "revoteCandidate",
    });
  }

  state.votes[player.id] = target.id;

  if (!state.readyIds.includes(player.id)) {
    state.readyIds.push(player.id);
  }

  return null;
}

function whisperThreadId(
  firstPlayerId: PlayerId,
  secondPlayerId: PlayerId,
): string {
  const [first, second] =
    firstPlayerId < secondPlayerId
      ? [firstPlayerId, secondPlayerId]
      : [secondPlayerId, firstPlayerId];
  return `whisper:${encodeURIComponent(first)}:${encodeURIComponent(second)}`;
}

function handleSendWhisper(
  state: RoomState,
  playerId: PlayerId,
  command: Extract<Command, { type: "sendWhisper" }>,
  now: number,
): EngineError | null {
  if (state.phase !== "dayDiscussion") {
    return engineError("WRONG_PHASE", "Errors.wrongPhase", {
      phase: state.phase,
    });
  }

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || !player.alive) {
    return engineError("NOT_ALIVE", "Errors.notAlive");
  }

  const recipient = state.players.find(
    (candidate) => candidate.id === command.toPlayerId,
  );
  if (
    !recipient ||
    !recipient.alive ||
    recipient.id === player.id
  ) {
    return engineError("INVALID_TARGET", "Errors.invalidTarget");
  }

  const text = cleanText(command.text);
  if (text.length < 1 || text.length > MAX_TEXT_LENGTH) {
    return engineError("INVALID_TEXT", "Errors.invalidText", {
      min: 1,
      max: MAX_TEXT_LENGTH,
    });
  }

  const sent = state.whispersSentThisDay[player.id] ?? 0;
  if (sent >= state.config.whisperBudget) {
    return engineError("BUDGET_EXHAUSTED", "Errors.whisperBudgetExhausted", {
      budget: state.config.whisperBudget,
    });
  }

  const threadId = whisperThreadId(player.id, recipient.id);
  let thread = state.whispers.find((candidate) => candidate.id === threadId);

  if (!thread) {
    const participantIds: [PlayerId, PlayerId] =
      player.id < recipient.id
        ? [player.id, recipient.id]
        : [recipient.id, player.id];
    thread = { id: threadId, participantIds, messages: [] };
    state.whispers.push(thread);
  }

  thread.messages.push({
    id: `${thread.id}:${thread.messages.length + 1}`,
    threadId: thread.id,
    fromPlayerId: player.id,
    text,
    at: now,
  });
  state.whispersSentThisDay[player.id] = sent + 1;

  return null;
}

function handleSendGraveyardMessage(
  state: RoomState,
  playerId: PlayerId,
  textInput: string,
  now: number,
): EngineError | null {
  if (state.phase === "lobby" || state.phase === "gameOver") {
    return engineError("WRONG_PHASE", "Errors.wrongPhase", {
      phase: state.phase,
    });
  }

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    return engineError("PLAYER_NOT_FOUND", "Errors.playerNotFound");
  }
  if (player.alive) {
    return engineError("NOT_DEAD", "Errors.onlyDead");
  }

  const text = cleanText(textInput);
  if (text.length < 1 || text.length > MAX_TEXT_LENGTH) {
    return engineError("INVALID_TEXT", "Errors.invalidText", {
      min: 1,
      max: MAX_TEXT_LENGTH,
    });
  }

  state.graveyard.push({
    id: `graveyard:${state.graveyard.length + 1}`,
    playerId: player.id,
    text,
    at: now,
  });

  return null;
}

function handleUpdateConfig(
  state: RoomState,
  playerId: PlayerId,
  configInput: RoomConfig,
): EngineError | null {
  if (state.hostId !== playerId) {
    return engineError("NOT_HOST", "Errors.notHost");
  }
  if (state.phase !== "lobby") {
    return engineError("WRONG_PHASE", "Errors.wrongPhase", {
      phase: state.phase,
    });
  }

  const config = normalizeConfig(configInput, state.players.length);
  const validation = validateConfig(config, {
    stage: "create",
    playerCount: state.players.length,
  });
  if (validation) {
    return validation;
  }

  state.config = config;
  return null;
}

export function reduce(
  state: RoomState,
  playerId: PlayerId,
  command: Command,
  now: number,
): ReduceResult {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    return failure("PLAYER_NOT_FOUND", "Errors.playerNotFound");
  }

  const next = structuredClone(state);
  let commandError: EngineError | null = null;

  switch (command.type) {
    case "setReady":
      commandError = handleSetReady(next, player.id);
      break;
    case "unsetReady":
      commandError = handleUnsetReady(next, player.id);
      break;
    case "startGame":
      commandError = handleStartGame(next, player.id, now);
      break;
    case "submitNightAction":
      commandError = handleSubmitNightAction(next, player.id, command, now);
      break;
    case "castVote":
      commandError = handleCastVote(next, player.id, command.targetId);
      break;
    case "sendWhisper":
      commandError = handleSendWhisper(next, player.id, command, now);
      break;
    case "sendGraveyardMessage":
      commandError = handleSendGraveyardMessage(
        next,
        player.id,
        command.text,
        now,
      );
      break;
    case "updateConfig":
      commandError = handleUpdateConfig(next, player.id, command.config);
      break;
    case "leaveRoom": {
      if (next.phase !== "lobby") {
        commandError = engineError("WRONG_PHASE", "Errors.wrongPhase", {
          phase: next.phase,
        });
        break;
      }
      if (next.players.length <= 1) {
        commandError = engineError("LAST_PLAYER", "Errors.lastPlayer");
        break;
      }
      removePlayerInPlace(next, player.id);
      break;
    }
    case "rematch":
      commandError = engineError("NOT_IMPLEMENTED", "Errors.notImplemented");
      break;
  }

  if (commandError) {
    return { ok: false, error: commandError };
  }

  maybeAutoAdvance(next, now);
  next.version += 1;
  next.updatedAt = now;

  return { ok: true, state: next };
}

export function advancePhase(state: RoomState, now: number): RoomState {
  const next = structuredClone(state);
  const changed = advancePhaseMutable(next, now);

  if (!changed) {
    return state;
  }

  next.version += 1;
  next.updatedAt = now;
  return next;
}

export function tick(state: RoomState, now: number): RoomState {
  if (state.phaseEndsAt !== null && now >= state.phaseEndsAt) {
    return advancePhase(state, now);
  }
  return state;
}

export function findPlayerByTokenHash(
  state: RoomState,
  tokenHash: string,
): ServerPlayer | undefined {
  return state.players.find((player) => player.tokenHash === tokenHash);
}
