"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BASE_VOTE_TALLY,
  INITIAL_STATE,
  PHASE_DURATIONS,
  PLAYER_SEED,
  ROLES,
  WHISPER_SEED,
} from "./data";
import type { GameState, Phase, Player, RoleDef } from "./types";

interface GameContextValue {
  state: GameState;
  you: Player;
  yourRole: RoleDef;
  alivePlayers: Player[];
  unreadWhispers: number;
  unreadAlerts: number;
  join: (name: string) => void;
  startGame: () => void;
  seeRole: () => void;
  submitAction: (targets: string[]) => void;
  beginDay: () => void;
  startVote: () => void;
  castVote: (playerId: string) => void;
  finishGame: () => void;
  advancePhase: () => void;
  resetGame: () => void;
  sendWhisper: (playerId: string, text: string) => void;
  markThreadRead: (playerId: string) => void;
  markAllAlertsRead: () => void;
  ensureThread: (playerId: string) => void;
  killSelf: () => void;
  sendGraveyardMessage: (text: string) => void;
  markGraveyardRead: () => void;
  getPlayer: (id: string) => Player | undefined;
}

const GameContext = createContext<GameContextValue | null>(null);

function freshPlayers(name: string): Player[] {
  return PLAYER_SEED.map((player) =>
    player.isYou ? { ...player, name } : { ...player },
  );
}

function freshState(): GameState {
  return {
    ...INITIAL_STATE,
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
  const duration = PHASE_DURATIONS[phase] ?? 0;

  return {
    ...state,
    ...extra,
    phase,
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

export function GameProvider({ children }: { children: ReactNode }) {
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

  const join = useCallback((name: string) => {
    const trimmed = name.trim();
    setState((current) => ({
      ...current,
      joined: true,
      playerName: trimmed || current.playerName,
      players: current.players.map((player) =>
        player.isYou ? { ...player, name: trimmed || player.name } : player,
      ),
    }));
  }, []);

  const startGame = useCallback(() => {
    setState((current) =>
      enterPhase(
        {
          ...freshState(),
          joined: current.joined,
          playerName: current.playerName,
          players: freshPlayers(current.playerName),
          round: 1,
        },
        "roleReveal",
      ),
    );
  }, []);

  const seeRole = useCallback(() => {
    setState((current) => enterPhase(current, "night"));
  }, []);

  const submitAction = useCallback((targets: string[]) => {
    setState((current) =>
      enterPhase(current, "nightReport", {
        actionTargets: targets,
        actionDone: true,
        players: killLucia(current.players),
      }),
    );
  }, []);

  const beginDay = useCallback(() => {
    setState((current) => enterPhase(current, "dayDiscussion"));
  }, []);

  const startVote = useCallback(() => {
    setState((current) => enterPhase(current, "voting"));
  }, []);

  const castVote = useCallback((playerId: string) => {
    setState((current) => resolveVote(current, playerId));
  }, []);

  const finishGame = useCallback(() => {
    setState((current) => enterPhase(current, "gameOver"));
  }, []);

  const advancePhase = useCallback(() => {
    setState((current) => nextPhaseState(current));
  }, []);

  const resetGame = useCallback(() => {
    setState((current) => ({
      ...freshState(),
      joined: current.joined,
      playerName: current.playerName,
      players: freshPlayers(current.playerName),
    }));
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

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      you,
      yourRole: ROLES[you.roleId],
      alivePlayers,
      unreadWhispers,
      unreadAlerts,
      join,
      startGame,
      seeRole,
      submitAction,
      beginDay,
      startVote,
      castVote,
      finishGame,
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
      join,
      startGame,
      seeRole,
      submitAction,
      beginDay,
      startVote,
      castVote,
      finishGame,
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

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used inside GameProvider");
  }
  return context;
}
