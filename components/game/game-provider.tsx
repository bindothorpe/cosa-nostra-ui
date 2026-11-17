"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { GameContext, type GameContextValue } from "./game-context";
import { LiveGameProvider } from "./live-game-provider";
import {
  BASE_VOTE_TALLY,
  BOT_READY_INTERVAL,
  INITIAL_STATE,
  PLAYER_SEED,
  playersForCount,
  ROLES,
  WHISPER_SEED,
} from "./data";
import {
  buildRoomConfig,
  cloneRoomConfig,
  DEFAULT_PHASE_DURATIONS,
  DEFAULT_PLAYER_COUNT,
  DEFAULT_ROOM_CONFIG,
  defaultFactionCounts,
  generateRoomCode,
} from "./room-config";
import type {
  ConfigurablePhase,
  GameState,
  Phase,
  Player,
  RoomConfig,
} from "./types";

function freshState(): GameState {
  return {
    ...INITIAL_STATE,
    roomConfig: cloneRoomConfig(DEFAULT_ROOM_CONFIG),
    players: PLAYER_SEED.map((player) => ({ ...player })),
    whispers: WHISPER_SEED.map((thread) => ({
      ...thread,
      messages: thread.messages.map((message) => ({ ...message })),
    })),
    alerts: INITIAL_STATE.alerts.map((alert) => ({ ...alert })),
    graveyard: INITIAL_STATE.graveyard.map((message) => ({ ...message })),
  };
}

function killLucia(players: Player[]): Player[] {
  return players.map((player) =>
    player.id === "lucia" && !player.isYou
      ? { ...player, alive: false }
      : player,
  );
}

function enterPhase(
  state: GameState,
  phase: Phase,
  extra: Partial<GameState> = {},
): GameState {
  const duration =
    state.roomConfig.phaseDurations[phase as ConfigurablePhase] ?? 0;

  return {
    ...state,
    ...extra,
    phase,
    readyIds: [],
    phaseEndsAt: duration > 0 ? Date.now() + duration : null,
  };
}

function resolveVote(current: GameState, playerId: string | null): GameState {
  const tally: Record<string, number> = { ...BASE_VOTE_TALLY };

  if (playerId) {
    tally[playerId] = (tally[playerId] ?? 0) + 1;
  }

  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const topCount = ranked[0]?.[1] ?? 0;
  const leaders = ranked.filter(([, count]) => count === topCount);
  const eliminatedId = leaders.length === 1 ? leaders[0][0] : null;
  const eliminated = current.players.find(
    (player) => player.id === eliminatedId,
  );

  return enterPhase(current, "voteResult", {
    yourVote: playerId ?? current.yourVote,
    voteTally: tally,
    eliminatedId,
    winnerFaction: eliminated?.faction === "mafia" ? "town" : "mafia",
    players: current.players.map((player) =>
      player.id === eliminatedId ? { ...player, alive: false } : player,
    ),
  });
}

function nextPhaseState(current: GameState): GameState {
  switch (current.phase) {
    case "roleReveal":
      return enterPhase(current, "night");
    case "night":
      return enterPhase(current, "nightReport", {
        players: killLucia(current.players),
      });
    case "nightReport":
      return enterPhase(current, "dayDiscussion");
    case "dayDiscussion":
      return enterPhase(current, "voting");
    case "voting":
      return resolveVote(current, current.yourVote);
    case "voteResult":
      return enterPhase(current, "gameOver");
    default:
      return current;
  }
}

export function MockGameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(freshState);

  useEffect(() => {
    if (state.phaseEndsAt === null) return;

    const interval = window.setInterval(() => {
      setState((current) => {
        if (current.phaseEndsAt === null) return current;
        if (Date.now() < current.phaseEndsAt) return current;
        return nextPhaseState(current);
      });
    }, 250);

    return () => window.clearInterval(interval);
  }, [state.phaseEndsAt]);

  useEffect(() => {
    const gated: Phase[] = [
      "roleReveal",
      "night",
      "dayDiscussion",
      "voting",
    ];
    if (!gated.includes(state.phase)) return;

    const self = state.players.find((player) => player.isYou);
    const selfReady =
      !self || !self.alive || state.readyIds.includes(self.id);
    if (!selfReady) return;

    const living = state.players.filter((player) => player.alive);
    const allReady = living.every((player) =>
      state.readyIds.includes(player.id),
    );
    const delay = allReady ? 0 : BOT_READY_INTERVAL;

    const timeout = window.setTimeout(() => {
      setState((current) => {
        if (current.phase !== state.phase) return current;

        const livingNow = current.players.filter((player) => player.alive);
        const everyoneReady = livingNow.every((player) =>
          current.readyIds.includes(player.id),
        );

        if (everyoneReady) return nextPhaseState(current);

        const nextBot = livingNow.find(
          (player) => !current.readyIds.includes(player.id),
        );
        if (!nextBot) return current;

        return {
          ...current,
          readyIds: [...current.readyIds, nextBot.id],
        };
      });
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [state.phase, state.readyIds, state.players]);

  const joinRoom = useCallback(
    async ({
      code,
      name,
      allowComplexRoles,
    }: {
      code: string;
      name: string;
      allowComplexRoles: boolean;
    }) => {
      const trimmed = name.trim();

      setState(() => {
        const config = buildRoomConfig({
          playerCount: DEFAULT_PLAYER_COUNT,
          factionPreset: "default",
          factionCounts: defaultFactionCounts(DEFAULT_PLAYER_COUNT),
          timerPreset: "default",
          phaseDurations: DEFAULT_PHASE_DURATIONS,
        });

        return {
          ...freshState(),
          joined: true,
          playerName: trimmed,
          roomCode: code.toUpperCase(),
          isHost: false,
          allowComplexRoles,
          roomConfig: config,
          players: playersForCount(DEFAULT_PLAYER_COUNT, trimmed),
        };
      });
    },
    [],
  );

  const createRoom = useCallback(
    async ({
      name,
      allowComplexRoles,
      config,
    }: {
      name: string;
      allowComplexRoles: boolean;
      config: RoomConfig;
    }) => {
      const trimmed = name.trim();

      setState(() => ({
        ...freshState(),
        joined: true,
        playerName: trimmed,
        roomCode: generateRoomCode(),
        isHost: true,
        allowComplexRoles,
        roomConfig: cloneRoomConfig(config),
        players: playersForCount(config.playerCount, trimmed),
      }));
    },
    [],
  );

  const startGame = useCallback(() => {
    setState((current) =>
      enterPhase(
        {
          ...freshState(),
          joined: current.joined,
          playerName: current.playerName,
          roomCode: current.roomCode,
          isHost: current.isHost,
          allowComplexRoles: current.allowComplexRoles,
          roomConfig: cloneRoomConfig(current.roomConfig),
          players: playersForCount(
            current.roomConfig.playerCount,
            current.playerName,
          ),
          round: 1,
        },
        "roleReveal",
      ),
    );
  }, []);

  const markReady = useCallback(() => {
    setState((current) => {
      const self = current.players.find((player) => player.isYou);
      if (!self?.alive || current.readyIds.includes(self.id)) return current;
      return {
        ...current,
        readyIds: [...current.readyIds, self.id],
      };
    });
  }, []);

  const unready = useCallback(() => {
    setState((current) => {
      const self = current.players.find((player) => player.isYou);
      if (!self?.alive || !current.readyIds.includes(self.id)) {
        return current;
      }

      return {
        ...current,
        actionDone: false,
        readyIds: current.readyIds.filter((id) => id !== self.id),
      };
    });
  }, []);

  const submitAction = useCallback((targets: string[]) => {
    setState((current) => {
      const self = current.players.find((player) => player.isYou);
      const readyIds =
        self?.alive && !current.readyIds.includes(self.id)
          ? [...current.readyIds, self.id]
          : current.readyIds;

      return {
        ...current,
        actionTargets: targets,
        actionDone: true,
        readyIds,
      };
    });
  }, []);

  const castVote = useCallback((playerId: string) => {
    setState((current) => {
      const self = current.players.find((player) => player.isYou);
      const readyIds =
        self?.alive && !current.readyIds.includes(self.id)
          ? [...current.readyIds, self.id]
          : current.readyIds;

      return {
        ...current,
        yourVote: playerId,
        readyIds,
      };
    });
  }, []);

  const advancePhase = useCallback(() => {
    setState((current) => nextPhaseState(current));
  }, []);

  const resetGame = useCallback(() => {
    setState(() => freshState());
  }, []);

  const sendWhisper = useCallback((playerId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setState((current) => {
      const self = current.players.find((player) => player.isYou);
      const recipient = current.players.find(
        (player) => player.id === playerId,
      );

      if (current.whispersLeft <= 0 || !self?.alive || !recipient?.alive) {
        return current;
      }

      const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const exists = current.whispers.some(
        (thread) => thread.playerId === playerId,
      );

      const whispers = exists
        ? current.whispers.map((thread) =>
            thread.playerId === playerId
              ? {
                  ...thread,
                  unread: 0,
                  messages: [
                    ...thread.messages,
                    {
                      id: `w-${playerId}-${thread.messages.length + 1}`,
                      from: "you" as const,
                      text: trimmed,
                      time,
                    },
                  ],
                }
              : thread,
          )
        : [
            ...current.whispers,
            {
              playerId,
              unread: 0,
              messages: [
                {
                  id: `w-${playerId}-1`,
                  from: "you" as const,
                  text: trimmed,
                  time,
                },
              ],
            },
          ];

      return {
        ...current,
        whispers,
        whispersLeft: current.whispersLeft - 1,
      };
    });
  }, []);

  const markThreadRead = useCallback((playerId: string) => {
    setState((current) => ({
      ...current,
      whispers: current.whispers.map((thread) =>
        thread.playerId === playerId ? { ...thread, unread: 0 } : thread,
      ),
    }));
  }, []);

  const markAllAlertsRead = useCallback(() => {
    setState((current) => ({
      ...current,
      alerts: current.alerts.map((alert) => ({ ...alert, read: true })),
    }));
  }, []);

  const ensureThread = useCallback((playerId: string) => {
    setState((current) => {
      if (current.whispers.some((thread) => thread.playerId === playerId)) {
        return current;
      }
      return {
        ...current,
        whispers: [
          ...current.whispers,
          { playerId, unread: 0, messages: [] },
        ],
      };
    });
  }, []);

  const killSelf = useCallback(() => {
    setState((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.isYou ? { ...player, alive: false } : player,
      ),
      graveyardUnread: Math.max(current.graveyardUnread, 1),
    }));
  }, []);

  const sendGraveyardMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setState((current) => {
      const self = current.players.find((player) => player.isYou);
      if (!self || self.alive) return current;

      const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      return {
        ...current,
        graveyard: [
          ...current.graveyard,
          {
            id: `grave-${current.graveyard.length + 1}`,
            playerId: self.id,
            text: trimmed,
            time,
          },
        ],
        graveyardUnread: 0,
      };
    });
  }, []);

  const markGraveyardRead = useCallback(() => {
    setState((current) => ({ ...current, graveyardUnread: 0 }));
  }, []);

  const you =
    state.players.find((player) => player.isYou) ?? state.players[0];
  const alivePlayers = state.players.filter((player) => player.alive);
  const unreadWhispers =
    state.whispers.reduce((total, thread) => total + thread.unread, 0) +
    (you.alive ? 0 : state.graveyardUnread);
  const unreadAlerts = state.alerts.filter((alert) => !alert.read).length;
  const isReady = you.alive && state.readyIds.includes(you.id);
  const waitingCount = alivePlayers.filter(
    (player) => !state.readyIds.includes(player.id),
  ).length;

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      you,
      yourRole: ROLES[you.roleId],
      alivePlayers,
      unreadWhispers,
      unreadAlerts,
      isReady,
      waitingCount,
      ready: true,
      joinRoom,
      createRoom,
      startGame,
      markReady,
      unready,
      submitAction,
      castVote,
      advancePhase,
      resetGame,
      sendWhisper,
      markThreadRead,
      markAllAlertsRead,
      ensureThread,
      killSelf,
      sendGraveyardMessage,
      markGraveyardRead,
      getPlayer: (id: string) =>
        state.players.find((player) => player.id === id),
    }),
    [
      state,
      you,
      alivePlayers,
      unreadWhispers,
      unreadAlerts,
      isReady,
      waitingCount,
      joinRoom,
      createRoom,
      startGame,
      markReady,
      unready,
      submitAction,
      castVote,
      advancePhase,
      resetGame,
      sendWhisper,
      markThreadRead,
      markAllAlertsRead,
      ensureThread,
      killSelf,
      sendGraveyardMessage,
      markGraveyardRead,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

const IS_LIVE = process.env.NEXT_PUBLIC_GAME_MODE === "live";

/**
 * Chooses the live adapter when `NEXT_PUBLIC_GAME_MODE === "live"`, otherwise
 * the unchanged mock provider. Screens keep importing `useGame` from here.
 */
export function GameProvider({ children }: { children: ReactNode }) {
  return IS_LIVE ? (
    <LiveGameProvider>{children}</LiveGameProvider>
  ) : (
    <MockGameProvider>{children}</MockGameProvider>
  );
}

export { useGame } from "./game-context";
export type { GameContextValue } from "./game-context";
