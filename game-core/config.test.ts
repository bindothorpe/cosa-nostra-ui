import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHASE_DURATIONS,
  DEFAULT_ROOM_CONFIG,
  MAX_PLAYERS,
  MIN_PHASE_DURATION_MS,
  MIN_PLAYERS,
  ROLE_IDS,
  ROLE_META,
  cloneRoomConfig,
  defaultRoleCountsFor,
  validateConfig,
} from "./index";
import type { RoleId, RoomConfig, TieRule } from "./index";

const EXPECTED_TABLE: Record<number, Record<RoleId, number>> = {
  3: { godfather: 1, framer: 0, detective: 1, doctor: 1, jester: 0, villager: 0 },
  4: { godfather: 1, framer: 0, detective: 1, doctor: 1, jester: 0, villager: 1 },
  5: { godfather: 1, framer: 0, detective: 1, doctor: 1, jester: 1, villager: 1 },
  6: { godfather: 1, framer: 0, detective: 1, doctor: 1, jester: 1, villager: 2 },
  7: { godfather: 1, framer: 0, detective: 1, doctor: 1, jester: 1, villager: 3 },
  8: { godfather: 1, framer: 1, detective: 1, doctor: 1, jester: 1, villager: 3 },
  9: { godfather: 1, framer: 1, detective: 1, doctor: 1, jester: 1, villager: 4 },
  10: { godfather: 1, framer: 1, detective: 1, doctor: 1, jester: 1, villager: 5 },
  11: { godfather: 1, framer: 1, detective: 1, doctor: 1, jester: 1, villager: 6 },
  12: { godfather: 1, framer: 2, detective: 1, doctor: 1, jester: 1, villager: 6 },
  13: { godfather: 1, framer: 2, detective: 1, doctor: 1, jester: 1, villager: 7 },
  14: { godfather: 1, framer: 2, detective: 1, doctor: 1, jester: 1, villager: 8 },
  15: { godfather: 1, framer: 2, detective: 1, doctor: 1, jester: 1, villager: 9 },
  16: { godfather: 1, framer: 3, detective: 1, doctor: 1, jester: 1, villager: 9 },
};

function configWith(overrides: Partial<RoomConfig>): RoomConfig {
  return { ...cloneRoomConfig(DEFAULT_ROOM_CONFIG), ...overrides };
}

function withRoleCounts(
  overrides: Partial<Record<RoleId, number>>,
): RoomConfig {
  return configWith({
    roleCounts: {
      ...cloneRoomConfig(DEFAULT_ROOM_CONFIG).roleCounts,
      ...overrides,
    },
  });
}

describe("role metadata", () => {
  it("exposes every role with faction and night activity", () => {
    expect([...ROLE_IDS]).toEqual([
      "godfather",
      "framer",
      "detective",
      "doctor",
      "villager",
      "jester",
    ]);

    expect(ROLE_META.godfather).toMatchObject({
      faction: "mafia",
      activeAtNight: true,
    });
    expect(ROLE_META.framer).toMatchObject({
      faction: "mafia",
      activeAtNight: true,
    });
    expect(ROLE_META.detective).toMatchObject({
      faction: "town",
      activeAtNight: true,
    });
    expect(ROLE_META.doctor).toMatchObject({
      faction: "town",
      activeAtNight: true,
    });
    expect(ROLE_META.villager).toMatchObject({
      faction: "town",
      activeAtNight: false,
    });
    expect(ROLE_META.jester).toMatchObject({
      faction: "neutral",
      activeAtNight: false,
    });

    for (const roleId of ROLE_IDS) {
      expect(ROLE_META[roleId].nameKey).toMatch(/^Roles\./);
      expect(ROLE_META[roleId].descriptionKey).toMatch(/^Roles\./);
    }
  });
});

describe("default role composition", () => {
  it("matches the formula for 3 through 16 players", () => {
    expect(MIN_PLAYERS).toBe(3);
    expect(MAX_PLAYERS).toBe(16);
    for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count += 1) {
      expect(defaultRoleCountsFor(count)).toEqual(EXPECTED_TABLE[count]);
    }
  });

  it("includes the 3 and 16 player boundary compositions", () => {
    expect(defaultRoleCountsFor(3)).toEqual({
      godfather: 1,
      framer: 0,
      detective: 1,
      doctor: 1,
      jester: 0,
      villager: 0,
    });
    expect(defaultRoleCountsFor(16)).toEqual({
      godfather: 1,
      framer: 3,
      detective: 1,
      doctor: 1,
      jester: 1,
      villager: 9,
    });
  });

  it("returns null outside the supported range", () => {
    expect(defaultRoleCountsFor(2)).toBeNull();
    expect(defaultRoleCountsFor(17)).toBeNull();
    expect(defaultRoleCountsFor(8.5)).toBeNull();
  });

  it("keeps every row summing to the player count", () => {
    for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count += 1) {
      const counts = defaultRoleCountsFor(count);
      expect(counts).not.toBeNull();
      const total = ROLE_IDS.reduce(
        (sum, roleId) => sum + (counts?.[roleId] ?? 0),
        0,
      );
      expect(total).toBe(count);
    }
  });

  it("has the documented default rules", () => {
    expect(DEFAULT_ROOM_CONFIG.rolePreset).toBe("default");
    expect(DEFAULT_ROOM_CONFIG.minPlayers).toBe(MIN_PLAYERS);
    expect(DEFAULT_ROOM_CONFIG.maxPlayers).toBe(MAX_PLAYERS);
    expect(DEFAULT_ROOM_CONFIG.whisperBudget).toBe(3);
    expect(DEFAULT_ROOM_CONFIG.tieRule).toBe("no-elimination");
    expect(DEFAULT_ROOM_CONFIG.revealRoleOnVote).toBe(true);
    expect(DEFAULT_ROOM_CONFIG.phaseDurations).toEqual({
      ...DEFAULT_PHASE_DURATIONS,
    });
  });
});

describe("validateConfig at room creation", () => {
  it("accepts the default config", () => {
    expect(
      validateConfig(DEFAULT_ROOM_CONFIG, {
        stage: "create",
        playerCount: 1,
      }),
    ).toBeNull();
  });

  it("accepts custom counts that do not sum to the current lobby size", () => {
    const config = withRoleCounts({
      godfather: 1,
      framer: 1,
      detective: 1,
      doctor: 1,
      jester: 0,
      villager: 4,
    });

    expect(
      validateConfig(config, { stage: "create", playerCount: 1 }),
    ).toBeNull();
  });

  it("rejects negative and fractional role counts", () => {
    expect(
      validateConfig(withRoleCounts({ villager: -1 }), {
        stage: "create",
        playerCount: 1,
      })?.code,
    ).toBe("INVALID_CONFIG");
    expect(
      validateConfig(withRoleCounts({ villager: 2.5 }), {
        stage: "create",
        playerCount: 1,
      })?.code,
    ).toBe("INVALID_CONFIG");
  });

  it("requires exactly one godfather when mafia exists", () => {
    expect(
      validateConfig(withRoleCounts({ godfather: 0, framer: 1 }), {
        stage: "create",
        playerCount: 1,
      })?.code,
    ).toBe("INVALID_CONFIG");
    expect(
      validateConfig(withRoleCounts({ godfather: 2, framer: 1 }), {
        stage: "create",
        playerCount: 1,
      })?.code,
    ).toBe("INVALID_CONFIG");
  });

  it("requires at least one mafia player", () => {
    const config = withRoleCounts({ godfather: 0, framer: 0 });
    expect(
      validateConfig(config, { stage: "create", playerCount: 1 })?.code,
    ).toBe("INVALID_CONFIG");
  });

  it("limits detective, doctor, and jester to one", () => {
    for (const roleId of ["detective", "doctor", "jester"] as const) {
      const config = withRoleCounts({ [roleId]: 2 });
      expect(
        validateConfig(config, { stage: "create", playerCount: 1 })?.code,
      ).toBe("INVALID_CONFIG");
    }
  });

  it("requires at least one town-aligned player", () => {
    const config = withRoleCounts({ villager: 0, detective: 0, doctor: 0 });
    expect(
      validateConfig(config, { stage: "create", playerCount: 1 })?.code,
    ).toBe("INVALID_CONFIG");
  });

  it("rejects phase durations outside 10s..600s", () => {
    expect(MIN_PHASE_DURATION_MS).toBe(10_000);
    for (const duration of [9_999, 600_001, Number.NaN, 30_000.5]) {
      const config = configWith({
        phaseDurations: {
          ...DEFAULT_PHASE_DURATIONS,
          night: duration,
        },
      });
      expect(
        validateConfig(config, { stage: "create", playerCount: 1 })?.code,
      ).toBe("INVALID_CONFIG");
    }
  });

  it("accepts duration boundaries", () => {
    for (const duration of [10_000, 600_000]) {
      const config = configWith({
        phaseDurations: {
          ...DEFAULT_PHASE_DURATIONS,
          night: duration,
        },
      });
      expect(
        validateConfig(config, { stage: "create", playerCount: 1 }),
      ).toBeNull();
    }
  });

  it("limits whisper budget to 0..10 integers", () => {
    for (const budget of [-1, 11, 1.5, Number.NaN]) {
      expect(
        validateConfig(configWith({ whisperBudget: budget }), {
          stage: "create",
          playerCount: 1,
        })?.code,
      ).toBe("INVALID_CONFIG");
    }
    for (const budget of [0, 10]) {
      expect(
        validateConfig(configWith({ whisperBudget: budget }), {
          stage: "create",
          playerCount: 1,
        }),
      ).toBeNull();
    }
  });

  it("rejects invalid tie rules and non-boolean reveal settings", () => {
    expect(
      validateConfig(
        configWith({ tieRule: "coin-flip" as TieRule }),
        { stage: "create", playerCount: 1 },
      )?.code,
    ).toBe("INVALID_CONFIG");
    expect(
      validateConfig(
        configWith({
          revealRoleOnVote: "yes" as unknown as boolean,
        }),
        { stage: "create", playerCount: 1 },
      )?.code,
    ).toBe("INVALID_CONFIG");
  });

  it("rejects player limits outside the supported bounds", () => {
    for (const limits of [
      { minPlayers: MIN_PLAYERS - 1 },
      { maxPlayers: MAX_PLAYERS + 1 },
      { minPlayers: 9, maxPlayers: 8 },
      { minPlayers: 3.5 },
    ]) {
      expect(
        validateConfig(configWith(limits), {
          stage: "create",
          playerCount: 1,
        })?.code,
      ).toBe("INVALID_CONFIG");
    }
  });
});

describe("validateConfig at start", () => {
  it("accepts a matching joined count", () => {
    for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count += 1) {
      const config = configWith({
        roleCounts: defaultRoleCountsFor(count) ?? DEFAULT_ROOM_CONFIG.roleCounts,
      });
      expect(
        validateConfig(config, { stage: "start", playerCount: count }),
      ).toBeNull();
    }
  });

  it("uses the configured player limits at start", () => {
    const smallRoom = configWith({
      maxPlayers: 8,
      roleCounts: defaultRoleCountsFor(9) ?? DEFAULT_ROOM_CONFIG.roleCounts,
    });
    expect(
      validateConfig(smallRoom, { stage: "start", playerCount: 9 })?.code,
    ).toBe("TOO_MANY_PLAYERS");

    const raisedMinimum = configWith({
      minPlayers: 5,
      roleCounts: defaultRoleCountsFor(4) ?? DEFAULT_ROOM_CONFIG.roleCounts,
    });
    expect(
      validateConfig(raisedMinimum, { stage: "start", playerCount: 4 })?.code,
    ).toBe("NOT_ENOUGH_PLAYERS");
  });

  it("accepts a 3-seat room at exactly 3 players", () => {
    const threeSeat = configWith({
      minPlayers: 3,
      maxPlayers: 3,
      roleCounts: defaultRoleCountsFor(3) ?? DEFAULT_ROOM_CONFIG.roleCounts,
    });
    expect(
      validateConfig(threeSeat, { stage: "start", playerCount: 3 }),
    ).toBeNull();
    expect(
      validateConfig(threeSeat, { stage: "start", playerCount: 4 })?.code,
    ).toBe("TOO_MANY_PLAYERS");
  });

  it("rejects role counts that do not sum to the joined count", () => {
    const error = validateConfig(DEFAULT_ROOM_CONFIG, {
      stage: "start",
      playerCount: 9,
    });
    expect(error?.code).toBe("ROLE_COUNT_MISMATCH");
    expect(error?.params).toEqual({ expected: 9, actual: 3 });
  });

  it("rejects fewer than 3 joined players", () => {
    const config = configWith({
      roleCounts: defaultRoleCountsFor(3) ?? DEFAULT_ROOM_CONFIG.roleCounts,
    });
    expect(
      validateConfig(config, { stage: "start", playerCount: 2 })?.code,
    ).toBe("NOT_ENOUGH_PLAYERS");
  });

  it("accepts 3 joined players when role counts sum to 3", () => {
    const config = configWith({
      roleCounts: defaultRoleCountsFor(3) ?? DEFAULT_ROOM_CONFIG.roleCounts,
    });
    expect(
      validateConfig(config, { stage: "start", playerCount: 3 }),
    ).toBeNull();
  });

  it("rejects more than 16 joined players", () => {
    expect(
      validateConfig(
        configWith({
          roleCounts: {
            godfather: 1,
            framer: 4,
            detective: 1,
            doctor: 1,
            jester: 1,
            villager: 9,
          },
        }),
        { stage: "start", playerCount: 17 },
      )?.code,
    ).toBe("TOO_MANY_PLAYERS");
  });

  it("still enforces structural rules at start", () => {
    const config = withRoleCounts({
      godfather: 0,
      framer: 2,
      detective: 1,
      doctor: 1,
      jester: 1,
      villager: 3,
    });
    expect(
      validateConfig(config, { stage: "start", playerCount: 8 })?.code,
    ).toBe("INVALID_CONFIG");
  });
});
