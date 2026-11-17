import type { Command, PlayerView } from "@/game-core/types";
import { realtimeWsUrl } from "./api";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface TransportError {
  code: string;
  messageKey: string;
  params?: Record<string, string | number>;
}

interface TransportHandlers {
  onStatus(status: ConnectionStatus): void;
  onSync(view: PlayerView, ackId?: string): void;
  onError(error: TransportError, ackId?: string): void;
  onReplaced?(): void;
}

const HEARTBEAT_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;
const CLOSE_INVALID_TOKEN = 4401;
const CLOSE_UNKNOWN_ROOM = 4404;
const CLOSE_CONFLICT = 4409;
const CLOSE_REPLACED = 4001;

export class RoomSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastPongAt = 0;
  private stopped = false;
  private listenersAttached = false;
  private readonly pending = new Set<string>();

  /**
   * Browsers throttle timers in background tabs and do not retry a socket once
   * the network is back. These handlers drive an immediate reconnect instead of
   * waiting for the current backoff delay.
   */
  private readonly handleOnline = (): void => {
    this.reconnectNow();
  };

  private readonly handleVisibilityChange = (): void => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      this.reconnectNow();
    }
  };

  constructor(
    private readonly code: string,
    private readonly token: string,
    private readonly handlers: TransportHandlers,
  ) {}

  connect(): void {
    this.stopped = false;
    this.attachLivenessListeners();
    this.open();
  }

  disconnect(): void {
    this.stopped = true;
    this.detachLivenessListeners();
    this.clearTimers();
    this.ws?.close(1000, "client closed");
    this.ws = null;
    this.handlers.onStatus("idle");
  }

  send(command: Command): string | null {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return null;

    const id = crypto.randomUUID();
    this.pending.add(id);
    this.ws.send(JSON.stringify({ type: "command", id, command }));
    return id;
  }

  private open(): void {
    if (this.stopped) return;

    // An immediate reconnect (online/visible) may race the backoff timer. Never
    // hold two live sockets for the same seat: the second would evict the first.
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.handlers.onStatus(
      this.reconnectAttempt === 0 ? "connecting" : "reconnecting",
    );

    // A heartbeat interval belongs to the socket that created it. Stop the old
    // one before replacing a stale closed/closing socket.
    this.stopHeartbeat();

    const ws = new WebSocket(realtimeWsUrl());
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.lastPongAt = Date.now();
      ws.send(JSON.stringify({ type: "hello", code: this.code, token: this.token }));
      this.startHeartbeat();
    });

    ws.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    ws.addEventListener("close", (event) => {
      // Ignore a stale socket: an immediate reconnect may already have replaced
      // it. Clearing `this.ws` here would otherwise orphan the new socket.
      if (this.ws !== ws) return;

      this.stopHeartbeat();
      this.ws = null;

      if (this.stopped) return;

      if (event.code === CLOSE_REPLACED) {
        this.stopped = true;
        this.detachLivenessListeners();
        this.handlers.onStatus("error");
        this.handlers.onReplaced?.();
        return;
      }

      if (
        event.code === CLOSE_INVALID_TOKEN ||
        event.code === CLOSE_UNKNOWN_ROOM ||
        event.code === CLOSE_CONFLICT
      ) {
        this.stopped = true;
        this.detachLivenessListeners();
        this.handlers.onStatus("error");
        return;
      }

      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // The close event drives reconnect; avoid duplicate scheduling here.
    });
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;

    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }

    if (!frame || typeof frame !== "object") return;
    const message = frame as Record<string, unknown>;

    if (message.type === "sync" && message.view) {
      const ackId =
        typeof message.ackId === "string" ? message.ackId : undefined;
      if (ackId) this.pending.delete(ackId);
      this.handlers.onStatus("connected");
      this.handlers.onSync(message.view as PlayerView, ackId);
      return;
    }

    if (message.type === "error") {
      const ackId =
        typeof message.id === "string" ? message.id : undefined;
      if (ackId) this.pending.delete(ackId);
      this.handlers.onError(
        {
          code: String(message.code ?? "UNKNOWN"),
          messageKey: String(message.messageKey ?? "Errors.unknown"),
          params: message.params as Record<string, string | number> | undefined,
        },
        ackId,
      );
      return;
    }

    if (message.type === "pong") {
      this.lastPongAt = Date.now();
    }
  }

  /** Open immediately when connectivity or visibility returns. */
  private reconnectNow(): void {
    if (this.stopped) return;

    // A socket that is already OPEN or still CONNECTING is not stale; opening a
    // second one would create the duplicate-socket eviction we are avoiding.
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.clearReconnectTimer();
    this.open();
  }

  private attachLivenessListeners(): void {
    if (this.listenersAttached || typeof window === "undefined") return;

    this.listenersAttached = true;
    window.addEventListener("online", this.handleOnline);
    window.document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
  }

  private detachLivenessListeners(): void {
    if (!this.listenersAttached || typeof window === "undefined") return;

    this.listenersAttached = false;
    window.removeEventListener("online", this.handleOnline);
    window.document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.handlers.onStatus("reconnecting");
    this.reconnectAttempt += 1;

    const base = Math.min(10_000, 500 * 2 ** (this.reconnectAttempt - 1));
    const jitter = Math.random() * 250;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.open();
    }, base + jitter);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        ws.close(4000, "heartbeat timeout");
        return;
      }

      ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    this.clearReconnectTimer();
  }
}
