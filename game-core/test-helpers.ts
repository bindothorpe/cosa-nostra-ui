import {
  DEFAULT_ROOM_CONFIG,
  addPlayer,
  advancePhase,
  cloneRoomConfig,
  createRoomState,
  reduce,
} from "./index";
import type {
  Command,
  PlayerId,
  ReduceResult,
  RoleId,
  RoomConfig,
  RoomState,
  ServerPlayer,
} from "./index";

export const NOW = 1_700_000_000_000;

export interface RoomOptions {
  count?: number;
  seed?: number;
  config?: RoomConfig;
}

export function must(result: ReduceResult): RoomState {
  if (!result.ok) {
    throw new Error(`Expected command to succeed, got ${result.error.code}`);
  }
  return result.state;
}

export function run(
  state: RoomState,
  playerId: PlayerId,
  command: Command,
  now: number = NOW,
): RoomState {
  return must(reduce(state, playerId, command, now));
}

export function makeRoom(
  count = 8,
  options: RoomOptions = {},
): RoomState {
  let state = createRoomState({
    code: "ABC234",
    hostId: "p1",
    hostName: "Host",
    hostTokenHash: "token:p1",
    seed: options.seed ?? 42,
    now: NOW,
    config: options.config ?? cloneRoomConfig(DEFAULT_ROOM_CONFIG),
  });

  for (let index = 2; index <= count; index += 1) {
    const result = addPlayer(state, {
      id: `p${index}`,
      name: `Player ${index}`,
      tokenHash: `token:p${index}`,
      now: NOW + index,
    });
    if (!result.ok) {
      throw new Error(`Failed to add p${index}: ${result.error.code}`);
    }
    state = result.state;
  }

  return state;
}

export function startedRoom(
  count = 8,
  options: RoomOptions = {},
): RoomState {
  return run(makeRoom(count, options), "p1", { type: "startGame" }, NOW + 100);
}

export function playersWithRole(
  state: RoomState,
  roleId: RoleId,
): ServerPlayer[] {
  return state.players.filter((player) => player.roleId === roleId);
}

export function playerWithRole(
  state: RoomState,
  roleId: RoleId,
): ServerPlayer {
  const player = playersWithRole(state, roleId)[0];
  if (!player) {
    throw new Error(`No player with role ${roleId}`);
  }
  return player;
}

export function livingPlayers(state: RoomState): ServerPlayer[] {
  return state.players.filter((player) => player.alive);
}

export function player(state: RoomState, playerId: PlayerId): ServerPlayer {
  const found = state.players.find((candidate) => candidate.id === playerId);
  if (!found) {
    throw new Error(`No player with id ${playerId}`);
  }
  return found;
}

export function toVoting(state: RoomState, now = NOW + 500): RoomState {
  let current = state;
  if (current.phase === "roleReveal") {
    current = advancePhase(current, now);
  }
  if (current.phase === "night") {
    current = advancePhase(current, now + 1);
  }
  if (current.phase === "nightReport") {
    current = advancePhase(current, now + 2);
  }
  if (current.phase === "dayDiscussion") {
    current = advancePhase(current, now + 3);
  }
  return current;
}

export function nextVoting(state: RoomState, now = NOW + 900): RoomState {
  let current = advancePhase(state, now);
  current = advancePhase(current, now + 1);
  current = advancePhase(current, now + 2);
  current = advancePhase(current, now + 3);
  return current;
}

export function castVotes(
  state: RoomState,
  assignments: ReadonlyArray<readonly [PlayerId, PlayerId]>,
  now = NOW + 1_000,
): RoomState {
  let current = state;
  assignments.forEach(([voterId, targetId], index) => {
    current = run(
      current,
      voterId,
      { type: "castVote", targetId },
      now + index,
    );
  });
  return current;
}

export function castVotesToEliminate(
  state: RoomState,
  targetId: PlayerId,
  now = NOW + 1_000,
): RoomState {
  const target = player(state, targetId);
  const fallback = livingPlayers(state).find(
    (candidate) => candidate.id !== target.id,
  );
  if (!fallback) {
    throw new Error("Cannot vote out the only living player");
  }

  const assignments: Array<readonly [PlayerId, PlayerId]> = [];
  for (const voter of livingPlayers(state)) {
    assignments.push([
      voter.id,
      voter.id === target.id ? fallback.id : target.id,
    ]);
  }
  return castVotes(state, assignments, now);
}

export function castTiedVotes(
  state: RoomState,
  firstTargetId: PlayerId,
  secondTargetId: PlayerId,
  now = NOW + 1_000,
): RoomState {
  const others = livingPlayers(state)
    .map((candidate) => candidate.id)
    .filter((id) => id !== firstTargetId && id !== secondTargetId);

  const assignments: Array<readonly [PlayerId, PlayerId]> = [
    [firstTargetId, secondTargetId],
    [secondTargetId, firstTargetId],
  ];
  others.forEach((voterId, index) => {
    assignments.push([
      voterId,
      index % 2 === 0 ? firstTargetId : secondTargetId,
    ]);
  });

  return castVotes(state, assignments, now);
}

export function readyAll(state: RoomState, now = NOW + 2_000): RoomState {
  let current = state;
  const ids = livingPlayers(current).map((candidate) => candidate.id);
  ids.forEach((playerId, index) => {
    current = run(current, playerId, { type: "setReady" }, now + index);
  });
  return current;
}

export function markDead(
  state: RoomState,
  playerIds: readonly PlayerId[],
): RoomState {
  const next = structuredClone(state);
  for (const playerId of playerIds) {
    const target = next.players.find((candidate) => candidate.id === playerId);
    if (!target || !target.alive) {
      continue;
    }
    target.alive = false;
    target.eliminatedAt = {
      phase: "night",
      round: next.round,
      cause: "night",
    };
    next.eliminatedIds.push(target.id);
  }
  next.readyIds = next.readyIds.filter((id) =>
    next.players.some((candidate) => candidate.id === id && candidate.alive),
  );
  return next;
}

export function forceVoting(state: RoomState, now = NOW + 3_000): RoomState {
  const next = structuredClone(state);
  next.phase = "voting";
  next.readyIds = [];
  next.votes = {};
  next.voteTally = null;
  next.revoteUsed = false;
  next.revoteCandidates = null;
  next.phaseEndsAt = now + next.config.phaseDurations.voting;
  return next;
}

export function forceNight(state: RoomState, now = NOW + 3_000): RoomState {
  const next = structuredClone(state);
  next.phase = "night";
  next.readyIds = [];
  next.votes = {};
  next.voteTally = null;
  next.nightActions = {};
  next.pendingNightResult = null;
  next.phaseEndsAt = now + next.config.phaseDurations.night;
  return next;
}
