import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_CONFIG,
  MAX_PLAYERS,
  addPlayer,
  canStartGame,
  cloneRoomConfig,
  createRoomState,
  defaultRoleCountsFor,
  engineError,
  findPlayerByTokenHash,
  reduce,
  removePlayer,
} from "./index";
import type { RoomConfig, RoomState } from "./index";
import { NOW, makeRoom, run, startedRoom } from "./test-helpers";

function customConfig(count = 8): RoomConfig {
  return {
    ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
    rolePreset: "custom",
    roleCounts: defaultRoleCountsFor(count) ?? DEFAULT_ROOM_CONFIG.roleCounts,
  };
}

describe("room creation", () => {
  it("creates a lobby with the host as the first player", () => {
    const state = createRoomState({
      code: "ABC234",
      hostId: "p1",
      hostName: "  Host  ",
      hostTokenHash: "token:p1",
      seed: 123,
      now: NOW,
      config: cloneRoomConfig(DEFAULT_ROOM_CONFIG),
    });

    expect(state.schemaVersion).toBe(1);
    expect(state.code).toBe("ABC234");
    expect(state.hostId).toBe("p1");
    expect(state.phase).toBe("lobby");
    expect(state.round).toBe(1);
    expect(state.phaseEndsAt).toBeNull();
    expect(state.createdAt).toBe(NOW);
    expect(state.updatedAt).toBe(NOW);
    expect(state.version).toBe(1);
    expect(state.seed).toBe(123);
    expect(state.players).toHaveLength(1);
    expect(state.players[0]).toMatchObject({
      id: "p1",
      name: "Host",
      tokenHash: "token:p1",
      alive: true,
      connected: true,
      joinedAt: NOW,
    });
    expect(state.readyIds).toEqual([]);
    expect(state.nightActions).toEqual({});
    expect(state.votes).toEqual({});
    expect(state.voteTally).toBeNull();
    expect(state.revoteUsed).toBe(false);
    expect(state.revoteCandidates).toBeNull();
    expect(state.eliminatedIds).toEqual([]);
    expect(state.winner).toBeNull();
    expect(state.whispers).toEqual([]);
    expect(state.whispersSentThisDay).toEqual({ p1: 0 });
    expect(state.graveyard).toEqual([]);
    expect(state.alertsByPlayer).toEqual({ p1: [] });
    expect(state.pendingNightResult).toBeNull();
  });

  it("rejects invalid host names", () => {
    expect(() =>
      createRoomState({
        code: "ABC234",
        hostId: "p1",
        hostName: "   ",
        hostTokenHash: "token:p1",
        seed: 1,
        now: NOW,
        config: cloneRoomConfig(DEFAULT_ROOM_CONFIG),
      }),
    ).toThrow();
  });

  it("exposes the engine error helper shape", () => {
    expect(engineError("NOT_HOST", "Errors.notHost")).toEqual({
      code: "NOT_HOST",
      messageKey: "Errors.notHost",
    });
    expect(engineError("ROOM_FULL", "Errors.roomFull", { max: 16 })).toEqual({
      code: "ROOM_FULL",
      messageKey: "Errors.roomFull",
      params: { max: 16 },
    });
  });

  it("finds players by token hash", () => {
    const state = makeRoom(8);
    expect(findPlayerByTokenHash(state, "token:p4")?.id).toBe("p4");
    expect(findPlayerByTokenHash(state, "missing")).toBeUndefined();
  });
});

describe("joining a room", () => {
  it("trims names and assigns deterministic colors", () => {
    const state = makeRoom(2);
    const result = addPlayer(state, {
      id: "p3",
      name: "  Marco  ",
      tokenHash: "token:p3",
      now: NOW + 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.players[2].name).toBe("Marco");
    expect(result.state.players[2].color).not.toBe(
      result.state.players[0].color,
    );
    expect(result.state.version).toBe(state.version + 1);
    expect(result.state.updatedAt).toBe(NOW + 50);
  });

  it("rejects duplicate names case-insensitively", () => {
    const state = makeRoom(3);
    const result = addPlayer(state, {
      id: "p4",
      name: "  player 2 ",
      tokenHash: "token:p4",
      now: NOW + 60,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NAME_TAKEN");
  });

  it("rejects empty, overlong, and duplicate ids", () => {
    const state = makeRoom(2);

    for (const name of ["", "   ", "x".repeat(21), "\u0000\u0001"]) {
      const result = addPlayer(state, {
        id: "new",
        name,
        tokenHash: "token:new",
        now: NOW,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_NAME");
      }
    }

    const duplicate = addPlayer(state, {
      id: "p1",
      name: "Someone else",
      tokenHash: "token:other",
      now: NOW,
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.code).toBe("PLAYER_EXISTS");
    }
  });

  it("enforces the default 16 player capacity", () => {
    const state = makeRoom(15);
    const sixteenth = addPlayer(state, {
      id: "p16",
      name: "Player 16",
      tokenHash: "token:p16",
      now: NOW + 100,
    });
    expect(sixteenth.ok).toBe(true);
    if (!sixteenth.ok) return;
    expect(sixteenth.state.players).toHaveLength(MAX_PLAYERS);

    const seventeenth = addPlayer(sixteenth.state, {
      id: "p17",
      name: "Player 17",
      tokenHash: "token:p17",
      now: NOW + 101,
    });
    expect(seventeenth.ok).toBe(false);
    if (!seventeenth.ok) {
      expect(seventeenth.error.code).toBe("ROOM_FULL");
      expect(seventeenth.error.params).toEqual({ max: MAX_PLAYERS });
    }
  });

  it("enforces a per-room maximum as players join", () => {
    const threeSeat = makeRoom(3, {
      config: {
        ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
        maxPlayers: 3,
      },
    });
    expect(threeSeat.players).toHaveLength(3);

    const fourth = addPlayer(threeSeat, {
      id: "p4",
      name: "Player 4",
      tokenHash: "token:p4",
      now: NOW + 100,
    });
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) {
      expect(fourth.error.code).toBe("ROOM_FULL");
      expect(fourth.error.params).toEqual({ max: 3 });
    }

    const eightSeat = makeRoom(8, {
      config: {
        ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
        maxPlayers: 8,
      },
    });
    const ninth = addPlayer(eightSeat, {
      id: "p9",
      name: "Player 9",
      tokenHash: "token:p9",
      now: NOW + 100,
    });
    expect(ninth.ok).toBe(false);
    if (!ninth.ok) {
      expect(ninth.error.code).toBe("ROOM_FULL");
      expect(ninth.error.params).toEqual({ max: 8 });
    }
  });

  it("rejects joins after the game starts", () => {
    const state = startedRoom(8);
    const result = addPlayer(state, {
      id: "late",
      name: "Late",
      tokenHash: "token:late",
      now: NOW + 100,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("GAME_STARTED");
    }
  });

  it("recomputes default counts as players join", () => {
    let state = makeRoom(8);
    expect(state.config.roleCounts).toEqual(defaultRoleCountsFor(8));

    const joined = addPlayer(state, {
      id: "p9",
      name: "Player 9",
      tokenHash: "token:p9",
      now: NOW + 200,
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    state = joined.state;
    expect(state.config.roleCounts).toEqual(defaultRoleCountsFor(9));
  });

  it("keeps custom counts stable as players join", () => {
    const config = customConfig(8);
    let state = makeRoom(8, { config });
    expect(state.config.rolePreset).toBe("custom");

    const joined = addPlayer(state, {
      id: "p9",
      name: "Player 9",
      tokenHash: "token:p9",
      now: NOW + 200,
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    state = joined.state;
    expect(state.config.roleCounts).toEqual(config.roleCounts);
  });
});

describe("leaving a room", () => {
  it("removes the player and transfers the host to the earliest joined player", () => {
    let state = makeRoom(4);
    state = run(state, "p1", { type: "leaveRoom" }, NOW + 400);

    expect(state.players.map((player) => player.id)).toEqual([
      "p2",
      "p3",
      "p4",
    ]);
    expect(state.hostId).toBe("p2");
    expect(state.alertsByPlayer.p1).toBeUndefined();
    expect(state.whispersSentThisDay.p1).toBeUndefined();
  });

  it("returns null when the last player is removed directly", () => {
    const onlyHost = createRoomState({
      code: "ABC234",
      hostId: "p1",
      hostName: "Host",
      hostTokenHash: "token:p1",
      seed: 1,
      now: NOW,
      config: cloneRoomConfig(DEFAULT_ROOM_CONFIG),
    });

    expect(removePlayer(onlyHost, "p1", NOW + 1)).toBeNull();
  });

  it("rejects the last player leaving through reduce", () => {
    const onlyHost = createRoomState({
      code: "ABC234",
      hostId: "p1",
      hostName: "Host",
      hostTokenHash: "token:p1",
      seed: 1,
      now: NOW,
      config: cloneRoomConfig(DEFAULT_ROOM_CONFIG),
    });

    const result = reduce(onlyHost, "p1", { type: "leaveRoom" }, NOW + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("LAST_PLAYER");
    }
  });

  it("removes phase-local references", () => {
    const state = makeRoom(3);
    state.readyIds = ["p2"];
    state.nightActions.p2 = {
      kind: "kill",
      targetId: "p1",
      submittedAt: NOW,
    };
    state.votes.p2 = "p1";

    const next = removePlayer(state, "p2", NOW + 2);
    expect(next).not.toBeNull();
    if (!next) return;
    expect(next.readyIds).toEqual([]);
    expect(next.nightActions.p2).toBeUndefined();
    expect(next.votes.p2).toBeUndefined();
  });

  it("does not remove players outside the lobby", () => {
    const state = startedRoom(8);
    const next = removePlayer(state, "p2", NOW + 500);
    expect(next).not.toBeNull();
    expect(next?.players).toHaveLength(8);
    expect(next).not.toBe(state);

    const result = reduce(state, "p2", { type: "leaveRoom" }, NOW + 500);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("WRONG_PHASE");
    }
  });

  it("keeps the host when a different player leaves", () => {
    const state = makeRoom(4);
    const next = removePlayer(state, "p3", NOW + 4);
    expect(next?.hostId).toBe("p1");
  });
});

describe("start readiness", () => {
  it("cannot start below the minimum, at a mismatch, or after starting", () => {
    expect(canStartGame(makeRoom(2))).toBe(false);
    expect(canStartGame(makeRoom(3))).toBe(true);
    expect(canStartGame(makeRoom(8))).toBe(true);
    expect(canStartGame(makeRoom(16))).toBe(true);
    expect(
      canStartGame(makeRoom(8, { config: customConfig(9) })),
    ).toBe(false);
    expect(canStartGame(startedRoom(8))).toBe(false);
  });

  it("lets default rooms start at a recomputed composition", () => {
    expect(canStartGame(makeRoom(10))).toBe(true);
  });

  it("uses the room's configured minimum for start readiness", () => {
    const raisedMinimum = {
      ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
      minPlayers: 8,
    };
    expect(
      canStartGame(makeRoom(7, { config: raisedMinimum })),
    ).toBe(false);
    expect(
      canStartGame(makeRoom(8, { config: raisedMinimum })),
    ).toBe(true);
  });

  it("rejects start from a non-host", () => {
    const state = makeRoom(8);
    const result = reduce(state, "p2", { type: "startGame" }, NOW + 10);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_HOST");
    }
  });
});

describe("lobby config updates", () => {
  it("lets the host update a custom config without requiring a matching sum", () => {
    const config = customConfig(8);
    const next = run(
      makeRoom(3),
      "p1",
      {
        type: "updateConfig",
        config: {
          ...config,
          roleCounts: { ...config.roleCounts, villager: 1 },
        },
      },
      NOW + 300,
    );

    expect(next.config.rolePreset).toBe("custom");
    expect(next.config.roleCounts.villager).toBe(1);
  });

  it("ignores role counts supplied for the default preset", () => {
    const next = run(
      makeRoom(8),
      "p1",
      {
        type: "updateConfig",
        config: {
          ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
          roleCounts: { ...DEFAULT_ROOM_CONFIG.roleCounts, villager: -99 },
        },
      },
      NOW + 300,
    );

    expect(next.config.rolePreset).toBe("default");
    expect(next.config.roleCounts).toEqual(defaultRoleCountsFor(8));
  });

  it("rejects updates from non-hosts and outside the lobby", () => {
    const state = makeRoom(8);
    const nonHost = reduce(
      state,
      "p2",
      { type: "updateConfig", config: customConfig(8) },
      NOW + 1,
    );
    expect(nonHost.ok).toBe(false);
    if (!nonHost.ok) {
      expect(nonHost.error.code).toBe("NOT_HOST");
    }

    const inGame = reduce(
      startedRoom(8),
      "p1",
      { type: "updateConfig", config: customConfig(8) },
      NOW + 1,
    );
    expect(inGame.ok).toBe(false);
    if (!inGame.ok) {
      expect(inGame.error.code).toBe("WRONG_PHASE");
    }
  });

  it("rejects invalid config values", () => {
    const result = reduce(
      makeRoom(8),
      "p1",
      {
        type: "updateConfig",
        config: {
          ...customConfig(8),
          phaseDurations: {
            ...customConfig(8).phaseDurations,
            night: 1,
          },
        },
      },
      NOW + 1,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CONFIG");
    }
  });

  it("does not mutate the input state", () => {
    const state: RoomState = makeRoom(8);
    const snapshot = structuredClone(state);

    run(
      state,
      "p1",
      { type: "updateConfig", config: cloneRoomConfig(state.config) },
      NOW + 1,
    );
    expect(state).toEqual(snapshot);
  });
});
