"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { defaultRoleCountsFor } from "@/game-core/config";
import type {
  AlertKind as ServerAlertKind,
  Command,
  NightActionKind,
  PlayerSummary,
  PlayerView,
  RoomConfig as ServerRoomConfig,
  WhisperThreadView,
} from "@/game-core/types";
import {
  createRoom as createRoomRequest,
  joinRoom as joinRoomRequest,
} from "@/components/room/api";
import {
  offsetFrom,
  serverNow,
  type ClockOffset,
} from "@/components/room/clock";
import {
  clearLastRoom,
  clearToken,
  getLastRoom,
  getName,
  getReadState,
  getToken,
  setLastRoom,
  setName,
  setReadState as setStoredReadState,
  setToken,
  type ReadState,
} from "@/components/room/storage";
import {
  RoomSocket,
  type ConnectionStatus,
  type TransportError,
} from "@/components/room/transport";
import { GameContext, type GameContextValue } from "./game-context";
import { ROLES } from "./data";
import { cloneRoomConfig, DEFAULT_ROOM_CONFIG } from "./room-config";
import type {
  AlertKind,
  DayActionKind,
  FactionCounts,
  GameAlert,
  GameState,
  GraveyardMessage,
  Player,
  RoleId,
  RoomConfig,
  WhisperMessage,
  WhisperThread,
} from "./types";

interface LiveConnection {
  code: string;
  token: string;
  isHost: boolean;
  name: string;
}

const EMPTY_YOU: Player = {
  id: "",
  name: "",
  roleId: "villager",
  faction: "town",
  alive: false,
  isYou: true,
  color: "",
};

const ZERO_ROLE_COUNTS: Record<RoleId, number> = {
  godfather: 0,
  consigliere: 0,
  framer: 0,
  detective: 0,
  doctor: 0,
  bodyguard: 0,
  roleblocker: 0,
  vigilante: 0,
  mayor: 0,
  villager: 0,
  jester: 0,
  executioner: 0,
};

/** Reserved read-receipt key for the graveyard (thread ids are UUIDs). */
const GRAVEYARD_READ_KEY = "__graveyard__";

const KIND_BY_ROLE: Partial<Record<RoleId, NightActionKind>> = {
  godfather: "kill",
  consigliere: "investigate",
  framer: "frame",
  detective: "investigate",
  doctor: "protect",
  bodyguard: "guard",
  roleblocker: "roleblock",
  vigilante: "shoot",
};

function factionCountsFromRoleCounts(
  roleCounts: Record<RoleId, number>,
): FactionCounts {
  return {
    mafia:
      roleCounts.godfather + roleCounts.consigliere + roleCounts.framer,
    town:
      roleCounts.detective +
      roleCounts.doctor +
      roleCounts.bodyguard +
      roleCounts.roleblocker +
      roleCounts.vigilante +
      roleCounts.mayor +
      roleCounts.villager,
    neutral: roleCounts.jester + roleCounts.executioner,
  };
}

/** Format a server timestamp as local HH:MM. */
function formatClock(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function toPlayer(summary: PlayerSummary, view: PlayerView): Player {
  const roleId = summary.roleId ?? (summary.isYou ? view.yourRole : null);
  const faction = summary.faction ?? (summary.isYou ? view.yourFaction : null);

  return {
    id: summary.id,
    name: summary.name,
    roleId: roleId ?? "villager",
    faction: faction ?? "town",
    alive: summary.alive,
    isYou: summary.isYou,
    color: summary.color,
    publicRoleId: summary.roleRevealed ? summary.roleId : null,
  };
}

function toAlertKind(kind: ServerAlertKind): AlertKind {
  // The UI has no "saved" alert kind; surface the doctor save as a system alert.
  return kind === "saved" ? "system" : kind;
}

function toWhisperThread(
  thread: WhisperThreadView,
  youId: string,
  readState: ReadState,
): WhisperThread {
  const otherId =
    thread.participantIds.find((participantId) => participantId !== youId) ??
    youId;
  const lastReadAt = readState.threads[thread.id] ?? 0;

  const messages: WhisperMessage[] = thread.messages.map((message) => ({
    id: message.id,
    from: message.fromPlayerId === youId ? "you" : "them",
    text: message.text,
    time: formatClock(message.at),
  }));

  const unread = thread.messages.filter(
    (message) => message.fromPlayerId !== youId && message.at > lastReadAt,
  ).length;

  return { playerId: otherId, unread, messages };
}

function toGameState({
  view,
  connection,
  fallbackConfig,
  readState,
  clockOffset,
  allowComplexRoles,
  localName,
}: {
  view: PlayerView | null;
  connection: LiveConnection | null;
  fallbackConfig: RoomConfig;
  readState: ReadState;
  clockOffset: ClockOffset;
  allowComplexRoles: boolean;
  localName: string;
}): GameState {
  if (!view) {
    return {
      phase: "lobby",
      phaseEndsAt: null,
      round: 1,
      joined: connection !== null,
      playerName: connection?.name || localName,
      roomCode: connection?.code ?? "",
      isHost: connection?.isHost ?? false,
      allowComplexRoles,
      roomConfig: cloneRoomConfig(fallbackConfig),
      players: [],
      actionTargets: [],
      actionDone: false,
      readyIds: [],
      yourVote: null,
      voteTally: null,
      eliminatedId: null,
      winnerFaction: null,
      whispers: [],
      whispersLeft: 0,
      alerts: [],
      graveyard: [],
      graveyardUnread: 0,
      yourDayActions: [],
      canStart: false,
    };
  }

  const players = view.players.map((summary) => toPlayer(summary, view));
  const you =
    players.find((player) => player.isYou) ?? toPlayer(view.you, view);

  const roleCounts =
    view.hostConfig?.roleCounts ??
    defaultRoleCountsFor(view.players.length) ??
    ZERO_ROLE_COUNTS;

  const whispers = view.whispers.map((thread) =>
    toWhisperThread(thread, view.you.id, readState),
  );

  const alerts: GameAlert[] = view.alerts.map((alert) => ({
    id: alert.id,
    kind: toAlertKind(alert.kind),
    night: alert.round,
    read: alert.at <= readState.alertsReadAt,
    titleKey: alert.titleKey,
    detailKey: alert.detailKey,
    params: alert.params ? { ...alert.params } : undefined,
    at: alert.at,
  }));

  const graveyard: GraveyardMessage[] = view.graveyard.map((message) => ({
    id: message.id,
    playerId: message.playerId,
    text: message.text,
    time: formatClock(message.at),
  }));

  const graveyardReadAt = readState.threads[GRAVEYARD_READ_KEY] ?? 0;
  const graveyardUnread = view.graveyard.filter(
    (message) => message.at > graveyardReadAt,
  ).length;

  return {
    phase: view.phase,
    // The UI counts down against the local clock, so convert the absolute
    // server deadline into its local-clock equivalent.
    phaseEndsAt:
      view.phaseEndsAt === null ? null : view.phaseEndsAt - clockOffset,
    round: view.round,
    joined: connection !== null,
    playerName: you.name || connection?.name || localName,
    roomCode: view.code,
    isHost: view.isHost,
    allowComplexRoles,
    roomConfig: {
      playerCount: view.config.maxPlayers,
      factionPreset: "default",
      factionCounts: factionCountsFromRoleCounts(roleCounts),
      roleCounts: { ...roleCounts },
      timerPreset: "default",
      phaseDurations: { ...view.config.phaseDurations },
    },
    players,
    actionTargets: view.yourAction ? [view.yourAction.targetId] : [],
    actionDone: view.yourAction !== null,
    readyIds: [...view.readyIds],
    yourVote: view.yourVote,
    voteTally: view.voteTally ? { ...view.voteTally } : null,
    eliminatedId:
      view.phase === "voteResult"
        ? (Object.keys(view.voteTally ?? {}).find((playerId) =>
            players.some(
              (player) => player.id === playerId && !player.alive,
            ),
          ) ?? null)
        : null,
    winnerFaction: view.winner?.faction ?? null,
    whispers,
    whispersLeft: view.whispersLeft,
    alerts,
    graveyard,
    graveyardUnread,
    yourDayActions: [...view.yourDayActions],
    targetName: view.yourTarget?.name,
    shotsLeft: view.yourShotsLeft,
    canStart: view.canStart,
  };
}

export function LiveGameProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<LiveConnection | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<TransportError | null>(null);
  const [clockOffset, setClockOffset] = useState<ClockOffset>(0);
  const [hydrated, setHydrated] = useState(false);
  const [readState, setReadState] = useState<ReadState>({
    threads: {},
    alertsReadAt: 0,
  });
  const [allowComplexRoles, setAllowComplexRoles] = useState(true);
  const [createdConfig, setCreatedConfig] = useState<RoomConfig | null>(null);
  const [localName, setLocalName] = useState("");

  const socketRef = useRef<RoomSocket | null>(null);
  const mountedRef = useRef(true);
  const connectionRef = useRef<LiveConnection | null>(null);
  const viewRef = useRef<PlayerView | null>(null);
  const clockOffsetRef = useRef<ClockOffset>(0);
  const readStateRef = useRef<ReadState>({ threads: {}, alertsReadAt: 0 });

  const applyReadState = useCallback((next: ReadState) => {
    readStateRef.current = next;
    setReadState(next);

    const code = connectionRef.current?.code;
    if (code) setStoredReadState(code, next);
  }, []);

  const connect = useCallback((next: LiveConnection) => {
    socketRef.current?.disconnect();

    connectionRef.current = next;
    setConnection(next);
    viewRef.current = null;
    setView(null);
    clockOffsetRef.current = 0;
    setClockOffset(0);
    setError(null);
    setStatus("connecting");

    const storedRead = getReadState(next.code);
    readStateRef.current = storedRead;
    setReadState(storedRead);

    const socket = new RoomSocket(next.code, next.token, {
      onStatus: (nextStatus) => {
        if (!mountedRef.current) return;
        setStatus(nextStatus);
      },
      onSync: (nextView) => {
        if (!mountedRef.current) return;

        const offset = offsetFrom(nextView.serverNow);
        viewRef.current = nextView;
        clockOffsetRef.current = offset;
        setView(nextView);
        setClockOffset(offset);
        setStatus("connected");
        setError(null);
      },
      onError: (nextError) => {
        if (!mountedRef.current) return;
        setError(nextError);
      },
      onReplaced: () => {
        if (!mountedRef.current) return;
        setError({
          code: "REPLACED_BY_NEW_CONNECTION",
          messageKey: "Errors.replacedByNewConnection",
        });
      },
    });

    socketRef.current = socket;
    socket.connect();
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const cleanup = () => {
      mountedRef.current = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };

    if (typeof window === "undefined") return cleanup;

    // `/live/*` mounts its own RoomProvider. Connecting here too would open a
    // second socket for the same token and the newest connection would evict
    // the debug screen.
    if (window.location.pathname.startsWith("/live")) {
      queueMicrotask(() => {
        if (mountedRef.current) setHydrated(true);
      });
      return cleanup;
    }

    const lastRoom = getLastRoom();
    const token = lastRoom ? getToken(lastRoom) : null;
    const storedName = getName();

    queueMicrotask(() => {
      if (!mountedRef.current) return;

      setHydrated(true);

      if (!lastRoom || !token || socketRef.current) return;

      setLocalName(storedName);
      setLastRoom(lastRoom);
      connect({ code: lastRoom, token, isHost: false, name: storedName });
    });

    return cleanup;
  }, [connect]);

  const createRoom = useCallback(
    async ({
      name,
      allowComplexRoles: allow,
      config,
    }: {
      name: string;
      allowComplexRoles: boolean;
      config: RoomConfig;
    }) => {
      const trimmed = name.trim();
      const serverConfig: ServerRoomConfig = {
        // The wizard resolves the actual role counts (randomized or custom),
        // so the server must preserve them instead of re-deriving defaults.
        rolePreset: "custom",
        minPlayers: config.playerCount,
        maxPlayers: config.playerCount,
        roleCounts: { ...config.roleCounts },
        phaseDurations: { ...config.phaseDurations },
        whisperBudget: 3,
        tieRule: "no-elimination",
        revealRoleOnVote: true,
      };

      const identity = await createRoomRequest(trimmed, serverConfig);
      if (!mountedRef.current) return;

      setToken(identity.code, identity.token);
      setName(trimmed);
      setLastRoom(identity.code);
      setLocalName(trimmed);
      setAllowComplexRoles(allow);
      setCreatedConfig(cloneRoomConfig(config));
      connect({
        code: identity.code,
        token: identity.token,
        isHost: true,
        name: trimmed,
      });
    },
    [connect],
  );

  const joinRoom = useCallback(
    async ({
      code,
      name,
      allowComplexRoles: allow,
    }: {
      code: string;
      name: string;
      allowComplexRoles: boolean;
    }) => {
      const trimmed = name.trim();
      const identity = await joinRoomRequest(code, trimmed, getToken(code));
      if (!mountedRef.current) return;

      setToken(identity.code, identity.token);
      setName(trimmed);
      setLastRoom(identity.code);
      setLocalName(trimmed);
      setAllowComplexRoles(allow);
      setCreatedConfig(null);
      connect({
        code: identity.code,
        token: identity.token,
        isHost: false,
        name: trimmed,
      });
    },
    [connect],
  );

  const send = useCallback((command: Command) => {
    socketRef.current?.send(command);
  }, []);

  const startGame = useCallback(() => send({ type: "startGame" }), [send]);
  const markReady = useCallback(() => send({ type: "setReady" }), [send]);
  const unready = useCallback(() => send({ type: "unsetReady" }), [send]);

  const castVote = useCallback(
    (playerId: string) => send({ type: "castVote", targetId: playerId }),
    [send],
  );

  const sendWhisper = useCallback(
    (playerId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      send({ type: "sendWhisper", toPlayerId: playerId, text: trimmed });
    },
    [send],
  );

  const sendGraveyardMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      send({ type: "sendGraveyardMessage", text: trimmed });
    },
    [send],
  );

  const submitAction = useCallback(
    (targets: string[]) => {
      const current = viewRef.current;
      if (!current || targets.length === 0) return;

      const kind = KIND_BY_ROLE[current.yourRole];
      if (!kind) return;

      // Godfather uses the last dragged target; the other roles use the first.
      const targetId =
        kind === "kill" ? targets[targets.length - 1] : targets[0];
      if (!targetId) return;

      send({ type: "submitNightAction", kind, targetId });
    },
    [send],
  );

  const submitDayAction = useCallback(
    (kind: DayActionKind) => send({ type: "submitDayAction", kind }),
    [send],
  );

  const advancePhase = useCallback(() => {
    // The server owns phase progression; the admin skip control is inert live.
  }, []);

  const killSelf = useCallback(() => {
    // Immortality is not a server command.
  }, []);

  const ensureThread = useCallback(() => {
    // The server creates whisper threads on the first message.
  }, []);

  const markThreadRead = useCallback(
    (playerId: string) => {
      const current = viewRef.current;
      if (!current) return;

      const thread = current.whispers.find((item) =>
        item.participantIds.includes(playerId),
      );
      if (!thread) return;

      // Skip if there is nothing newer to acknowledge. The whisper screen calls
      // this from an effect that re-runs when player objects change identity;
      // without this guard that would loop forever.
      const latestAt = thread.messages.reduce(
        (latest, message) => Math.max(latest, message.at),
        0,
      );
      if (latestAt <= (readStateRef.current.threads[thread.id] ?? 0)) return;

      applyReadState({
        ...readStateRef.current,
        threads: {
          ...readStateRef.current.threads,
          [thread.id]: serverNow(clockOffsetRef.current),
        },
      });
    },
    [applyReadState],
  );

  const markAllAlertsRead = useCallback(() => {
    applyReadState({
      ...readStateRef.current,
      alertsReadAt: serverNow(clockOffsetRef.current),
    });
  }, [applyReadState]);

  const markGraveyardRead = useCallback(() => {
    applyReadState({
      ...readStateRef.current,
      threads: {
        ...readStateRef.current.threads,
        [GRAVEYARD_READ_KEY]: serverNow(clockOffsetRef.current),
      },
    });
  }, [applyReadState]);

  const resetGame = useCallback(() => {
    const current = connectionRef.current;

    if (viewRef.current?.phase === "lobby") {
      socketRef.current?.send({ type: "leaveRoom" });
    }
    if (current) {
      clearToken(current.code);
      clearLastRoom();
    }

    socketRef.current?.disconnect();
    socketRef.current = null;
    connectionRef.current = null;
    viewRef.current = null;
    clockOffsetRef.current = 0;
    readStateRef.current = { threads: {}, alertsReadAt: 0 };

    setConnection(null);
    setView(null);
    setStatus("idle");
    setError(null);
    setClockOffset(0);
    setReadState(readStateRef.current);
    setLocalName("");
    setCreatedConfig(null);
  }, []);

  const state = useMemo(
    () =>
      toGameState({
        view,
        connection,
        fallbackConfig: createdConfig ?? DEFAULT_ROOM_CONFIG,
        readState,
        clockOffset,
        allowComplexRoles,
        localName,
      }),
    [
      view,
      connection,
      createdConfig,
      readState,
      clockOffset,
      allowComplexRoles,
      localName,
    ],
  );

  const you = state.players.find((player) => player.isYou) ?? EMPTY_YOU;
  const yourRole = ROLES[you.roleId];
  const alivePlayers = state.players.filter((player) => player.alive);
  const unreadWhispers =
    state.whispers.reduce((total, thread) => total + thread.unread, 0) +
    (you.alive ? 0 : state.graveyardUnread);
  const unreadAlerts = state.alerts.filter((alert) => !alert.read).length;
  const isReady = you.alive && state.readyIds.includes(you.id);
  const waitingCount = view?.waitingCount ?? 0;

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      you,
      yourRole,
      alivePlayers,
      unreadWhispers,
      unreadAlerts,
      isReady,
      waitingCount,
      ready: hydrated,
      status,
      view,
      error,
      clockOffset,
      joinRoom,
      createRoom,
      startGame,
      markReady,
      unready,
      submitAction,
      submitDayAction,
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
      yourRole,
      alivePlayers,
      unreadWhispers,
      unreadAlerts,
      isReady,
      waitingCount,
      hydrated,
      status,
      view,
      error,
      clockOffset,
      joinRoom,
      createRoom,
      startGame,
      markReady,
      unready,
      submitAction,
      submitDayAction,
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
