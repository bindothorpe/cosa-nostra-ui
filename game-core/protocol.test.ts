import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_CONFIG,
  cloneRoomConfig,
  parseClientFrame,
  parseServerFrame,
  playerViewSchema,
  project,
  roomConfigSchema,
  serverFrameSchema,
  clientFrameSchema,
} from "./index";
import { NOW, startedRoom } from "./test-helpers";

describe("client frame parsing", () => {
  it("accepts hello frames", () => {
    const frame = parseClientFrame({
      type: "hello",
      code: "ABC234",
      token: "opaque-token",
    });
    expect(frame).toEqual({
      type: "hello",
      code: "ABC234",
      token: "opaque-token",
    });
  });

  it("accepts every command shape", () => {
    const commands = [
      { type: "setReady" },
      { type: "unsetReady" },
      { type: "startGame" },
      {
        type: "submitNightAction",
        kind: "kill",
        targetId: "p2",
      },
      { type: "submitNightAction", kind: "frame", targetId: "p2" },
      { type: "submitNightAction", kind: "investigate", targetId: "p2" },
      { type: "submitNightAction", kind: "protect", targetId: "p2" },
      { type: "submitNightAction", kind: "guard", targetId: "p2" },
      { type: "submitNightAction", kind: "roleblock", targetId: "p2" },
      { type: "submitNightAction", kind: "shoot", targetId: "p2" },
      { type: "submitDayAction", kind: "reveal" },
      { type: "castVote", targetId: "p2" },
      { type: "sendWhisper", toPlayerId: "p2", text: "hello" },
      { type: "sendGraveyardMessage", text: "hello" },
      { type: "updateConfig", config: cloneRoomConfig(DEFAULT_ROOM_CONFIG) },
      { type: "leaveRoom" },
      { type: "rematch" },
    ];

    for (const command of commands) {
      const parsed = parseClientFrame({
        type: "command",
        id: "cmd-1",
        command,
      });
      expect(parsed).toEqual({ type: "command", id: "cmd-1", command });
    }
  });

  it("accepts ping frames", () => {
    expect(parseClientFrame({ type: "ping", t: 1234 })).toEqual({
      type: "ping",
      t: 1234,
    });
  });

  it("rejects malformed frames", () => {
    const invalid = [
      null,
      {},
      { type: "nope" },
      { type: "hello", code: "ABC234" },
      { type: "hello", code: "", token: "x" },
      { type: "command", id: "x", command: { type: "startGame", extra: 1 } },
      {
        type: "command",
        id: "x",
        command: { type: "castVote", targetId: "" },
      },
      {
        type: "command",
        id: "x",
        command: { type: "submitNightAction", kind: "chat", targetId: "p2" },
      },
      {
        type: "command",
        id: "x",
        command: {
          type: "sendWhisper",
          toPlayerId: "p2",
          text: "x".repeat(501),
        },
      },
      { type: "ping", t: "soon" },
    ];

    for (const frame of invalid) {
      expect(() => parseClientFrame(frame)).toThrow();
    }
  });

  it("strips nothing because schemas are strict", () => {
    expect(() =>
      parseClientFrame({
        type: "hello",
        code: "ABC234",
        token: "token",
        extra: true,
      }),
    ).toThrow();
  });
});

describe("config schema", () => {
  it("accepts the default config", () => {
    expect(roomConfigSchema.parse(cloneRoomConfig(DEFAULT_ROOM_CONFIG))).toEqual(
      cloneRoomConfig(DEFAULT_ROOM_CONFIG),
    );
  });

  it("requires all twelve role-count keys", () => {
    const missingOne = { ...DEFAULT_ROOM_CONFIG.roleCounts };
    delete (missingOne as Partial<typeof missingOne>).executioner;

    expect(() =>
      roomConfigSchema.parse({
        ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
        roleCounts: missingOne,
      }),
    ).toThrow();
  });

  it("accepts every documented night action kind", () => {
    for (const kind of [
      "kill",
      "frame",
      "investigate",
      "protect",
      "guard",
      "roleblock",
      "shoot",
    ] as const) {
      expect(
        parseClientFrame({
          type: "command",
          id: `cmd-${kind}`,
          command: { type: "submitNightAction", kind, targetId: "p2" },
        }),
      ).toMatchObject({ type: "command", command: { kind } });
    }
  });

  it("rejects negative role counts and unknown keys", () => {
    expect(() =>
      roomConfigSchema.parse({
        ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
        roleCounts: {
          ...DEFAULT_ROOM_CONFIG.roleCounts,
          villager: -1,
        },
      }),
    ).toThrow();

    expect(() =>
      roomConfigSchema.parse({
        ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
        unexpected: true,
      }),
    ).toThrow();
  });
});

describe("server frame parsing", () => {
  it("accepts a projected sync frame", () => {
    const state = startedRoom(8);
    const frame = {
      type: "sync",
      version: state.version,
      serverNow: NOW,
      ackId: "cmd-1",
      view: project(state, "p1", NOW),
    };

    expect(parseServerFrame(frame)).toEqual(frame);
    expect(serverFrameSchema.parse(frame)).toEqual(frame);
    expect(playerViewSchema.parse(frame.view)).toEqual(frame.view);
  });

  it("accepts pong and error frames", () => {
    expect(
      parseServerFrame({ type: "pong", t: 10, serverNow: NOW }),
    ).toEqual({ type: "pong", t: 10, serverNow: NOW });

    expect(
      parseServerFrame({
        type: "error",
        id: "cmd-1",
        code: "NOT_HOST",
        messageKey: "Errors.notHost",
        params: { min: 8 },
      }),
    ).toEqual({
      type: "error",
      id: "cmd-1",
      code: "NOT_HOST",
      messageKey: "Errors.notHost",
      params: { min: 8 },
    });
  });

  it("rejects malformed server frames", () => {
    expect(() =>
      parseServerFrame({ type: "sync", version: 1, serverNow: NOW }),
    ).toThrow();
    expect(() =>
      parseServerFrame({ type: "error", code: "X" }),
    ).toThrow();
    expect(() =>
      parseServerFrame({ type: "unknown" }),
    ).toThrow();
  });

  it("exposes the client frame schema", () => {
    expect(
      clientFrameSchema.safeParse({ type: "ping", t: 1 }).success,
    ).toBe(true);
  });
});
