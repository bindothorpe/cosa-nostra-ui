"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BASE_VOTE_TALLY,
  INITIAL_STATE,
  PLAYER_SEED,
  ROLES,
  WHISPER_SEED,
} from "./data";
import type { GameState, Player, RoleDef } from "./types";

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
  submitAction: (targetId: string) => void;
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
  };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(freshState);

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
    setState((current) => ({
      ...freshState(),
      joined: current.joined,
      playerName: current.playerName,
      players: freshPlayers(current.playerName),
      phase: "roleReveal",
      round: 1,
    }));
  }, []);

  const seeRole = useCallback(() => {
    setState((current) => ({ ...current, phase: "night" }));
  }, []);

  const submitAction = useCallback((targetId: string) => {
    setState((current) => ({
      ...current,
      actionTarget: targetId,
      actionDone: true,
      phase: "nightReport",
      players: current.players.map((player) =>
        player.id === "lucia" && !player.isYou
          ? { ...player, alive: false }
          : player,
      ),
    }));
  }, []);

  const beginDay = useCallback(() => {
    setState((current) => ({ ...current, phase: "dayDiscussion" }));
  }, []);

  const startVote = useCallback(() => {
    setState((current) => ({ ...current, phase: "voting" }));
  }, []);

  const castVote = useCallback((playerId: string) => {
    setState((current) => {
      const tally: Record<string, number> = { ...BASE_VOTE_TALLY };
      tally[playerId] = (tally[playerId] ?? 0) + 1;

      const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      const topCount = ranked[0]?.[1] ?? 0;
      const leaders = ranked.filter(([, count]) => count === topCount);
      const eliminatedId = leaders.length === 1 ? leaders[0][0] : null;
      const eliminated = current.players.find(
        (player) => player.id === eliminatedId,
      );

      return {
        ...current,
        phase: "voteResult",
        yourVote: playerId,
        voteTally: tally,
        eliminatedId,
        winnerFaction: eliminated?.faction === "mafia" ? "town" : "mafia",
        players: current.players.map((player) =>
          player.id === eliminatedId ? { ...player, alive: false } : player,
        ),
      };
    });
  }, []);

  const finishGame = useCallback(() => {
    setState((current) => ({ ...current, phase: "gameOver" }));
  }, []);

  const advancePhase = useCallback(() => {
    setState((current) => {
      switch (current.phase) {
        case "roleReveal":
          return { ...current, phase: "night" };
        case "night":
          return {
            ...current,
            phase: "nightReport",
            players: current.players.map((player) =>
              player.id === "lucia" && !player.isYou
                ? { ...player, alive: false }
                : player,
            ),
          };
        case "nightReport":
          return { ...current, phase: "dayDiscussion" };
        case "dayDiscussion":
          return { ...current, phase: "voting" };
        case "voteResult":
          return { ...current, phase: "gameOver" };
        default:
          return current;
      }
    });
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
      if (current.whispersLeft <= 0) return current;

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

  const you = state.players.find((player) => player.isYou) ?? state.players[0];
  const alivePlayers = state.players.filter((player) => player.alive);
  const unreadWhispers = state.whispers.reduce(
    (total, thread) => total + thread.unread,
    0,
  );
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
