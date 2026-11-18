import { describe, expect, it } from "vitest";
import {
  canDisableRole,
  createFullRolePool,
  emptyRoleCounts,
  requiresDuplicates,
  resolveRoleCounts,
  ROLE_IDS,
  ROLE_META,
} from "./index";
import type { FactionSeats, RoleId, RolePool } from "./index";

const SEATS_12: FactionSeats = { mafia: 3, town: 7, neutral: 2 };
const SEATS_16: FactionSeats = { mafia: 4, town: 10, neutral: 2 };

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function total(counts: Record<RoleId, number>): number {
  return ROLE_IDS.reduce((sum, roleId) => sum + counts[roleId], 0);
}

function factionTotal(
  counts: Record<RoleId, number>,
  faction: "mafia" | "town" | "neutral",
): number {
  return ROLE_IDS.filter(
    (roleId) => ROLE_META[roleId].faction === faction,
  ).reduce((sum, roleId) => sum + counts[roleId], 0);
}

function poolWithout(...disabled: RoleId[]): RolePool {
  const pool = createFullRolePool();
  for (const roleId of disabled) pool[roleId] = false;
  return pool;
}

describe("role selection", () => {
  it("fills every faction exactly with distinct roles when capacity allows", () => {
    const result = resolveRoleCounts({
      seats: SEATS_12,
      pool: createFullRolePool(),
      allowDuplicates: false,
      random: seededRandom(7),
    });

    expect(result.duplicatesForced).toBe(false);
    expect(total(result.roleCounts)).toBe(12);
    expect(result.roleCounts.godfather).toBe(1);
    expect(factionTotal(result.roleCounts, "mafia")).toBe(3);
    expect(factionTotal(result.roleCounts, "town")).toBe(7);
    expect(factionTotal(result.roleCounts, "neutral")).toBe(2);

    for (const roleId of ROLE_IDS) {
      expect(result.roleCounts[roleId]).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for a given random source", () => {
    const first = resolveRoleCounts({
      seats: SEATS_12,
      pool: createFullRolePool(),
      allowDuplicates: true,
      random: seededRandom(99),
    });
    const second = resolveRoleCounts({
      seats: SEATS_12,
      pool: createFullRolePool(),
      allowDuplicates: true,
      random: seededRandom(99),
    });

    expect(first).toEqual(second);
  });

  it("forces duplicates when the unique pool cannot fill the seats", () => {
    const result = resolveRoleCounts({
      seats: SEATS_16,
      pool: createFullRolePool(),
      allowDuplicates: false,
      random: seededRandom(3),
    });

    expect(result.duplicatesForced).toBe(true);
    expect(total(result.roleCounts)).toBe(16);
    expect(result.roleCounts.godfather).toBe(1);
    expect(factionTotal(result.roleCounts, "mafia")).toBe(4);
    expect(factionTotal(result.roleCounts, "town")).toBe(10);
    expect(factionTotal(result.roleCounts, "neutral")).toBe(2);
    expect(
      ROLE_IDS.some(
        (roleId) => roleId !== "godfather" && result.roleCounts[roleId] > 1,
      ),
    ).toBe(true);
  });

  it("only uses enabled roles and repeats them when forced", () => {
    const pool = poolWithout(
      "detective",
      "doctor",
      "bodyguard",
      "roleblocker",
      "vigilante",
      "mayor",
      "consigliere",
      "executioner",
    );

    const result = resolveRoleCounts({
      seats: { mafia: 2, town: 6, neutral: 1 },
      pool,
      allowDuplicates: false,
      random: seededRandom(11),
    });

    expect(result.duplicatesForced).toBe(true);
    expect(result.roleCounts.godfather).toBe(1);
    expect(result.roleCounts.framer).toBe(1);
    expect(result.roleCounts.villager).toBe(6);
    expect(result.roleCounts.jester).toBe(1);

    for (const roleId of [
      "detective",
      "doctor",
      "bodyguard",
      "roleblocker",
      "vigilante",
      "mayor",
      "consigliere",
      "executioner",
    ] as const) {
      expect(result.roleCounts[roleId]).toBe(0);
    }
  });

  it("picks a random subset when more roles are enabled than seats", () => {
    const result = resolveRoleCounts({
      seats: { mafia: 1, town: 2, neutral: 1 },
      pool: createFullRolePool(),
      allowDuplicates: false,
      random: seededRandom(5),
    });

    expect(total(result.roleCounts)).toBe(4);
    expect(result.roleCounts.godfather).toBe(1);
    expect(factionTotal(result.roleCounts, "town")).toBe(2);
    expect(factionTotal(result.roleCounts, "neutral")).toBe(1);

    const enabledTownRoles = ROLE_IDS.filter(
      (roleId) =>
        ROLE_META[roleId].faction === "town" &&
        result.roleCounts[roleId] > 0,
    );
    expect(enabledTownRoles).toHaveLength(2);
  });

  it("always seats exactly one Godfather even when disabled in the pool", () => {
    const result = resolveRoleCounts({
      seats: SEATS_12,
      pool: poolWithout("godfather"),
      allowDuplicates: false,
      random: seededRandom(1),
    });

    expect(result.roleCounts.godfather).toBe(1);
    expect(total(result.roleCounts)).toBe(12);
  });

  it("reports when duplicates are required per faction", () => {
    expect(
      requiresDuplicates(SEATS_12, createFullRolePool()),
    ).toBe(false);
    expect(requiresDuplicates(SEATS_16, createFullRolePool())).toBe(true);
    expect(
      requiresDuplicates(
        { mafia: 2, town: 1, neutral: 0 },
        poolWithout("consigliere", "framer"),
      ),
    ).toBe(true);
  });

  it("locks the Godfather and protects the last usable role in a faction", () => {
    const full = createFullRolePool();
    expect(canDisableRole("godfather", SEATS_12, full)).toBe(false);

    const onlyVillager = poolWithout(
      "detective",
      "doctor",
      "bodyguard",
      "roleblocker",
      "vigilante",
      "mayor",
    );
    expect(
      canDisableRole("villager", { mafia: 1, town: 1, neutral: 0 }, onlyVillager),
    ).toBe(false);
    expect(
      canDisableRole("villager", { mafia: 1, town: 0, neutral: 0 }, onlyVillager),
    ).toBe(true);

    const onlyFramer = poolWithout("consigliere");
    expect(
      canDisableRole("framer", { mafia: 2, town: 1, neutral: 0 }, onlyFramer),
    ).toBe(false);
    expect(
      canDisableRole("framer", { mafia: 1, town: 1, neutral: 0 }, onlyFramer),
    ).toBe(true);
  });

  it("returns an all-zero map helper", () => {
    const counts = emptyRoleCounts();
    expect(total(counts)).toBe(0);
    expect(Object.keys(counts).sort()).toEqual([...ROLE_IDS].sort());
  });
});
