import { WebSocket } from "ws";
import {
  project,
  reduce,
  tick as coreTick,
} from "../../game-core";
import type {
  Command,
  PlayerId,
  RoomState,
  ServerFrame,
} from "../../game-core/types";
import type { Logger } from "./logger";
import { TokenBucket } from "./rate-limit";
import type { SnapshotStore } from "./snapshot-store";

interface RoomOptions {
  state: RoomState;
  store: SnapshotStore;
  logger: Logger;
  snapshotDebounceMs: number;
  lobbyTtlMs: number;
  gameoverTtlMs: number;
  onEmpty(code: string): Promise<void> | void;
}

interface Ack {
  playerId: PlayerId;
  commandId: string;
}

export class Room {
  state: RoomState;

  private readonly sockets = new Map<PlayerId, WebSocket>();
  private readonly commandResults = new Map<
    PlayerId,
    Map<string, number>
  >();
  private readonly commandLimiter = new TokenBucket(10, 1);
  private readonly whisperLimiter = new TokenBucket(1, 2);

  private phaseTimer: NodeJS.Timeout | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private saveChain: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(private readonly options: RoomOptions) {
    this.state = options.state;
  }

  get code(): string {
    return this.state.code;
  }

  get socketCount(): number {
    return this.sockets.size;
  }

  connect(playerId: PlayerId, socket: WebSocket): void {
    const previous = this.sockets.get(playerId);
    if (previous && previous !== socket) {
      previous.close(4001, "replaced by new connection");
    }

    this.sockets.set(playerId, socket);
    this.setConnected(playerId, true);
    this.sendSync(socket, playerId);
    this.broadcast();
    this.scheduleSave();
  }

  /**
   * Apply a state produced outside the socket command path (HTTP join) and
   * notify everyone already in the lobby.
   */
  applyExternalState(state: RoomState, now = Date.now()): void {
    this.state = state;
    this.state.updatedAt = now;
    this.broadcast();
    this.scheduleSave();
  }

  disconnect(playerId: PlayerId, socket: WebSocket): void {
    if (this.sockets.get(playerId) !== socket) return;

    this.sockets.delete(playerId);
    this.setConnected(playerId, false);
    this.broadcast();
    this.scheduleSave();
  }

  handleCommand(
    playerId: PlayerId,
    commandId: string,
    command: Command,
    now = Date.now(),
  ): void {
    const socket = this.sockets.get(playerId);
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const previousVersion = this.findCommand(playerId, commandId);
    if (previousVersion !== undefined) {
      this.sendSync(socket, playerId, commandId);
      return;
    }

    if (!this.commandLimiter.allow(playerId, 1, now)) {
      this.sendError(socket, commandId, {
        code: "RATE_LIMIT",
        messageKey: "Errors.rateLimit",
      });
      return;
    }

    if (
      command.type === "sendWhisper" &&
      !this.whisperLimiter.allow(playerId, 1, now)
    ) {
      this.sendError(socket, commandId, {
        code: "RATE_LIMIT",
        messageKey: "Errors.rateLimit",
      });
      return;
    }

    const result = reduce(this.state, playerId, command, now);
    if (!result.ok) {
      this.sendError(socket, commandId, result.error);
      return;
    }

    this.state = result.state;
    this.rememberCommand(playerId, commandId, this.state.version);
    this.schedule();
    this.scheduleSave();

    if (!this.state.players.some((player) => player.id === playerId)) {
      const socketForPlayer = this.sockets.get(playerId);
      this.sockets.delete(playerId);
      socketForPlayer?.close(1000, "left room");
    }

    this.broadcast({ playerId, commandId });

    if (this.state.players.length === 0) {
      void this.options.onEmpty(this.code);
    }
  }

  handlePing(socket: WebSocket, sentAt: unknown): void {
    this.send(socket, {
      type: "pong",
      t: typeof sentAt === "number" ? sentAt : Date.now(),
      serverNow: Date.now(),
    });
  }

  isExpired(now = Date.now()): boolean {
    if (this.state.phase === "lobby") {
      return now - this.state.updatedAt > this.options.lobbyTtlMs;
    }
    if (this.state.phase === "gameOver") {
      return now - this.state.updatedAt > this.options.gameoverTtlMs;
    }
    return false;
  }

  schedule(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }

    if (this.closed || this.state.phaseEndsAt === null) return;

    const delay = Math.max(0, this.state.phaseEndsAt - Date.now());
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      this.advance(Date.now());
    }, delay);
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    const snapshot = structuredClone(this.state);
    this.saveChain = this.saveChain
      .then(() => this.options.store.save(snapshot))
      .catch((error) => {
        this.options.logger.error("room.snapshot_failed", {
          roomCode: this.code,
          error: error instanceof Error ? error.stack : String(error),
        });
      });

    await this.saveChain;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }

    for (const socket of this.sockets.values()) {
      socket.close(1001, "room closed");
    }
    this.sockets.clear();

    await this.flush();
  }

  private advance(now: number): void {
    const next = coreTick(this.state, now);
    if (next === this.state) {
      this.schedule();
      return;
    }

    this.state = next;
    this.scheduleSave();
    this.broadcast();
    this.schedule();
  }

  private setConnected(playerId: PlayerId, connected: boolean): void {
    const player = this.state.players.find((item) => item.id === playerId);
    if (!player || player.connected === connected) return;

    player.connected = connected;
    this.state.version += 1;
    this.state.updatedAt = Date.now();
  }

  private broadcast(ack?: Ack): void {
    for (const [playerId, socket] of this.sockets) {
      if (socket.readyState !== WebSocket.OPEN) continue;

      const ackId =
        ack && ack.playerId === playerId ? ack.commandId : undefined;
      this.sendSync(socket, playerId, ackId);
    }
  }

  private sendSync(
    socket: WebSocket,
    playerId: PlayerId,
    ackId?: string,
  ): void {
    let view;
    try {
      view = project(this.state, playerId);
    } catch (error) {
      this.options.logger.warn("room.project_failed", {
        roomCode: this.code,
        playerId,
        error: String(error),
      });
      return;
    }

    this.send(socket, {
      type: "sync",
      version: this.state.version,
      serverNow: Date.now(),
      ackId,
      view,
    });
  }

  private sendError(
    socket: WebSocket,
    id: string,
    error: {
      code: string;
      messageKey: string;
      params?: Record<string, string | number>;
    },
  ): void {
    this.send(socket, {
      type: "error",
      id,
      code: error.code,
      messageKey: error.messageKey,
      params: error.params,
    });
  }

  private send(socket: WebSocket, frame: ServerFrame): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(frame));
  }

  private findCommand(playerId: PlayerId, commandId: string): number | undefined {
    return this.commandResults.get(playerId)?.get(commandId);
  }

  private rememberCommand(
    playerId: PlayerId,
    commandId: string,
    version: number,
  ): void {
    const results =
      this.commandResults.get(playerId) ?? new Map<string, number>();
    results.set(commandId, version);

    if (results.size > 32) {
      const oldest = results.keys().next().value;
      if (oldest !== undefined) results.delete(oldest);
    }

    this.commandResults.set(playerId, results);
  }

  private scheduleSave(): void {
    if (this.closed) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, this.options.snapshotDebounceMs);
  }
}
