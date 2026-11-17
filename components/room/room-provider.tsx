"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Command, PlayerId, PlayerView, RoomConfig } from "@/game-core/types";
import { RoomSocket, type ConnectionStatus, type TransportError } from "./transport";
import { offsetFrom, type ClockOffset } from "./clock";
import { getToken, setLastRoom } from "./storage";

interface RoomActions {
  setReady(): void;
  unsetReady(): void;
  startGame(): void;
  submitNightAction(
    kind: "kill" | "frame" | "investigate" | "protect",
    targetId: PlayerId,
  ): void;
  castVote(targetId: PlayerId): void;
  sendWhisper(toPlayerId: PlayerId, text: string): void;
  sendGraveyardMessage(text: string): void;
  updateConfig(config: RoomConfig): void;
  leaveRoom(): void;
}

export interface RoomContextValue {
  status: ConnectionStatus;
  view: PlayerView | null;
  error: TransportError | null;
  clockOffset: ClockOffset;
  pendingCommandId: string | null;
  actions: RoomActions;
}

export const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({
  code,
  children,
}: {
  code: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<TransportError | null>(null);
  const [clockOffset, setClockOffset] = useState<ClockOffset>(0);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);

  const socketRef = useRef<RoomSocket | null>(null);

  useEffect(() => {
    const token = getToken(code);
    if (!token) {
      queueMicrotask(() => {
        setStatus("error");
        setError({ code: "NO_TOKEN", messageKey: "Errors.noToken" });
      });
      return;
    }

    setLastRoom(code);

    const socket = new RoomSocket(code, token, {
      onStatus: setStatus,
      onSync: (nextView, ackId) => {
        setView(nextView);
        setClockOffset(offsetFrom(nextView.serverNow));
        setError(null);
        if (ackId) setPendingCommandId(null);
      },
      onError: (nextError, ackId) => {
        setError(nextError);
        if (ackId) setPendingCommandId(null);
      },
      onReplaced: () => {
        setError({
          code: "REPLACED_BY_NEW_CONNECTION",
          messageKey: "Errors.replacedByNewConnection",
        });
      },
    });

    socketRef.current = socket;
    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code]);

  const send = useCallback((command: Command) => {
    const id = socketRef.current?.send(command) ?? null;
    if (id) setPendingCommandId(id);
    return id;
  }, []);

  const actions = useMemo<RoomActions>(
    () => ({
      setReady: () => void send({ type: "setReady" }),
      unsetReady: () => void send({ type: "unsetReady" }),
      startGame: () => void send({ type: "startGame" }),
      submitNightAction: (kind, targetId) =>
        void send({ type: "submitNightAction", kind, targetId }),
      castVote: (targetId) => void send({ type: "castVote", targetId }),
      sendWhisper: (toPlayerId, text) =>
        void send({ type: "sendWhisper", toPlayerId, text }),
      sendGraveyardMessage: (text) =>
        void send({ type: "sendGraveyardMessage", text }),
      updateConfig: (config) => void send({ type: "updateConfig", config }),
      leaveRoom: () => void send({ type: "leaveRoom" }),
    }),
    [send],
  );

  const value = useMemo<RoomContextValue>(
    () => ({
      status,
      view,
      error,
      clockOffset,
      pendingCommandId,
      actions,
    }),
    [status, view, error, clockOffset, pendingCommandId, actions],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
