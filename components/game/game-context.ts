"use client";

import { createContext, useContext } from "react";
import type { PlayerView } from "@/game-core/types";
import type { ClockOffset } from "@/components/room/clock";
import type {
  ConnectionStatus,
  TransportError,
} from "@/components/room/transport";
import type { GameState, Player, RoleDef, RoomConfig } from "./types";

/**
 * Screen-facing game API. Shared by the mock and live providers so every
 * existing screen keeps importing the same hook and reading the same shape.
 *
 * The connection fields are only populated by the live provider; they are
 * optional so the mock provider does not need to invent them.
 */
export interface GameContextValue {
  state: GameState;
  you: Player;
  yourRole: RoleDef;
  alivePlayers: Player[];
  unreadWhispers: number;
  unreadAlerts: number;
  isReady: boolean;
  waitingCount: number;
  /** False until the live provider has attempted to restore a stored seat. */
  ready: boolean;
  /** Live-mode transport status. Undefined in mock mode. */
  status?: ConnectionStatus;
  /** Live-mode latest server projection. Undefined in mock mode. */
  view?: PlayerView | null;
  /** Live-mode last transport error. Undefined in mock mode. */
  error?: TransportError | null;
  /** Live-mode server clock offset. Undefined in mock mode. */
  clockOffset?: ClockOffset;
  joinRoom: (params: {
    code: string;
    name: string;
    allowComplexRoles: boolean;
  }) => Promise<void>;
  createRoom: (params: {
    name: string;
    allowComplexRoles: boolean;
    config: RoomConfig;
  }) => Promise<void>;
  startGame: () => void;
  markReady: () => void;
  unready: () => void;
  submitAction: (targets: string[]) => void;
  castVote: (playerId: string) => void;
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

export const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used inside GameProvider");
  }
  return context;
}
