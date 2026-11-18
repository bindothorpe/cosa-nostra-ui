import {
  ROLE_META,
  clonePhaseDurations,
  cloneRoomConfig,
} from "./config";
import { canStartGame } from "./engine";
import type {
  GraveyardMessage,
  NightAction,
  PlayerId,
  PlayerSummary,
  PlayerView,
  PublicRoomConfig,
  RoomConfig,
  RoomState,
  ServerPlayer,
  WhisperThread,
  WhisperThreadView,
} from "./types";

function toSummary(
  player: ServerPlayer,
  viewerId: PlayerId,
  revealRole: boolean,
): PlayerSummary {
  return {
    id: player.id,
    name: player.name,
    alive: player.alive,
    connected: player.connected,
    isYou: player.id === viewerId,
    color: player.color,
    roleId: revealRole ? player.roleId : null,
    faction: revealRole ? player.faction : null,
  };
}

function toPublicConfig(config: RoomConfig): PublicRoomConfig {
  return {
    rolePreset: config.rolePreset,
    minPlayers: config.minPlayers,
    maxPlayers: config.maxPlayers,
    phaseDurations: clonePhaseDurations(config.phaseDurations),
    whisperBudget: config.whisperBudget,
    tieRule: config.tieRule,
    revealRoleOnVote: config.revealRoleOnVote,
  };
}

function toWhisperThreadView(thread: WhisperThread): WhisperThreadView {
  return {
    id: thread.id,
    participantIds: [thread.participantIds[0], thread.participantIds[1]],
    messages: thread.messages.map((message) => ({ ...message })),
  };
}

function cloneGraveyard(messages: readonly GraveyardMessage[]): GraveyardMessage[] {
  return messages.map((message) => ({ ...message }));
}

function findKillAction(
  nightActions: Readonly<Record<string, NightAction | undefined>>,
): { actorId: PlayerId; action: NightAction } | null {
  for (const [actorId, action] of Object.entries(nightActions)) {
    if (action?.kind === "kill") {
      return { actorId, action };
    }
  }
  return null;
}

export function project(
  state: RoomState,
  viewerId: PlayerId,
  now: number = Date.now(),
): PlayerView {
  const viewer = state.players.find((player) => player.id === viewerId);
  if (!viewer) {
    throw new Error(`Cannot project a view for unknown player "${viewerId}".`);
  }

  const gameOver = state.phase === "gameOver";
  const viewerIsMafia = viewer.faction === "mafia";

  const revealRoleFor = (player: ServerPlayer): boolean => {
    if (gameOver) {
      return true;
    }
    if (player.id === viewer.id) {
      return true;
    }
    if (viewerIsMafia && player.faction === "mafia") {
      return true;
    }
    return (
      state.config.revealRoleOnVote &&
      player.eliminatedAt?.cause === "vote"
    );
  };

  const summaries = state.players.map((player) =>
    toSummary(player, viewer.id, revealRoleFor(player)),
  );
  const you = summaries.find((summary) => summary.id === viewer.id);
  if (!you) {
    throw new Error(`Cannot project a view for unknown player "${viewerId}".`);
  }

  const livingPlayers = state.players.filter((player) => player.alive);
  const readyIds = state.readyIds.filter((playerId) =>
    livingPlayers.some((player) => player.id === playerId),
  );

  const whisperThreads = state.whispers
    .filter((thread) => thread.participantIds.includes(viewer.id))
    .map((thread) => toWhisperThreadView(thread));

  const sent = state.whispersSentThisDay[viewer.id] ?? 0;
  const whispersLeft = viewer.alive
    ? Math.max(0, state.config.whisperBudget - sent)
    : 0;

  const view: PlayerView = {
    code: state.code,
    version: state.version,
    serverNow: now,
    phase: state.phase,
    round: state.round,
    phaseEndsAt: state.phaseEndsAt,
    hostId: state.hostId,
    isHost: state.hostId === viewer.id,
    config: toPublicConfig(state.config),
    you,
    players: summaries,
    livingCount: livingPlayers.length,
    readyIds,
    waitingCount: Math.max(0, livingPlayers.length - readyIds.length),
    yourRole: viewer.roleId,
    yourFaction: viewer.faction,
    yourAction:
      state.phase === "night"
        ? state.nightActions[viewer.id] ?? null
        : null,
    yourTarget: (() => {
      if (viewer.roleId !== "executioner") return null;
      const targetId = state.executionerTargets[viewer.id];
      if (!targetId) return null;
      const target = state.players.find((player) => player.id === targetId);
      return target ? toSummary(target, viewer.id, false) : null;
    })(),
    yourShotsLeft: state.vigilanteShots[viewer.id] ?? 0,
    yourVote: state.votes[viewer.id] ?? null,
    voteTally:
      state.phase === "voteResult" || gameOver
        ? state.voteTally
          ? { ...state.voteTally }
          : null
        : null,
    eliminatedIds: [...state.eliminatedIds],
    winner: state.winner ? { ...state.winner } : null,
    whispers: whisperThreads,
    whispersLeft,
    graveyard:
      viewer.alive && !gameOver
        ? []
        : cloneGraveyard(state.graveyard),
    alerts: (state.alertsByPlayer[viewer.id] ?? []).map((alert) => ({
      ...alert,
      params: alert.params ? { ...alert.params } : undefined,
    })),
    nightReport:
      state.phase === "nightReport" && state.pendingNightResult
        ? { deaths: [...state.pendingNightResult.deaths] }
        : null,
    canStart:
      state.phase === "lobby" &&
      state.hostId === viewer.id &&
      canStartGame(state),
    canAct:
      state.phase === "night" &&
      viewer.alive &&
      ROLE_META[viewer.roleId].activeAtNight,
    canVote: state.phase === "voting" && viewer.alive,
  };

  if (state.phase === "lobby" && state.hostId === viewer.id) {
    view.hostConfig = cloneRoomConfig(state.config);
  }

  if (viewerIsMafia) {
    const kill = findKillAction(state.nightActions);
    view.mafiaKill =
      state.phase === "night" && kill
        ? {
            actorId: kill.actorId,
            kind: "kill",
            targetId: kill.action.targetId,
            submittedAt: kill.action.submittedAt,
          }
        : null;
  }

  return view;
}
