import { WebSocket } from "ws";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_CONFIG,
  createRoomState,
} from "../../game-core";
import type { Logger, LogLevel } from "../src/logger";
import { Room } from "../src/room";
import type { SnapshotStore } from "../src/snapshot-store";
import { hashToken } from "../src/token";

const HOST_ID = "host-1";
const EMPTY_TTL_MS = 1_000;

interface CapturedEvent {
  level: LogLevel;
  event: string;
  fields?: Record<string, unknown>;
}

function captureLogger(): { logger: Logger; events: CapturedEvent[] } {
  const events: CapturedEvent[] = [];
  const record =
    (level: LogLevel) => (event: string, fields?: Record<string, unknown>) => {
      events.push({ level, event, fields });
    };

  return {
    logger: {
      debug: record("debug"),
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
    },
    events,
  };
}

function fakeSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: () => {},
    close: () => {},
  } as unknown as WebSocket;
}

function makeRoom(logger: Logger): Room {
  const now = Date.now();
  const state = createRoomState({
    code: "ABCDE",
    hostId: HOST_ID,
    hostName: "Host",
    hostTokenHash: hashToken("token"),
    seed: 1,
    now,
    config: DEFAULT_ROOM_CONFIG,
  });

  return new Room({
    state,
    store: {
      save: async () => {},
      delete: async () => {},
    } as unknown as SnapshotStore,
    logger,
    snapshotDebounceMs: 60_000,
    lobbyTtlMs: 7_200_000,
    gameoverTtlMs: 900_000,
    emptyTtlMs: EMPTY_TTL_MS,
    onEmpty: () => {},
  });
}

describe("room expiry", () => {
  it("expires a room that never got a socket after the empty TTL", async () => {
    const { logger } = captureLogger();
    const room = makeRoom(logger);

    expect(room.expiryReason(Date.now() + EMPTY_TTL_MS - 500)).toBeNull();
    expect(room.expiryReason(Date.now() + EMPTY_TTL_MS + 5_000)).toBe(
      "empty_ttl",
    );

    await room.close();
  });

  it("restarts the empty TTL on connect and starts it on last disconnect", async () => {
    const { logger } = captureLogger();
    const room = makeRoom(logger);
    const socket = fakeSocket();

    room.connect(HOST_ID, socket);
    expect(room.expiryReason(Date.now() + EMPTY_TTL_MS + 5_000)).toBeNull();

    const disconnectedAt = Date.now();
    room.disconnect(HOST_ID, socket, disconnectedAt);
    expect(room.expiryReason(disconnectedAt + EMPTY_TTL_MS - 1)).toBeNull();
    expect(room.expiryReason(disconnectedAt + EMPTY_TTL_MS + 1)).toBe(
      "empty_ttl",
    );

    await room.close();
  });

  it("logs lastSeenAt on ping and includes it when the room empties", async () => {
    const { logger, events } = captureLogger();
    const room = makeRoom(logger);
    const socket = fakeSocket();

    room.connect(HOST_ID, socket);
    room.handlePing(HOST_ID, socket, Date.now());
    room.disconnect(HOST_ID, socket);

    const pingSeen = events.find(
      (entry) =>
        entry.event === "room.last_seen" && entry.fields?.trigger === "ping",
    );
    expect(pingSeen?.fields?.lastSeenAt).toEqual(expect.any(Number));

    const empty = events.find((entry) => entry.event === "room.empty");
    expect(empty?.fields?.lastSeenAtByPlayer).toMatchObject({
      [HOST_ID]: expect.any(Number),
    });
    expect(empty?.fields?.emptyTtlMs).toBe(EMPTY_TTL_MS);

    await room.close();
  });
});
