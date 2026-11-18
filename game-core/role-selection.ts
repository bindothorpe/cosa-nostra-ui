import { ROLE_IDS, ROLE_META } from "./config";
import type { Faction, RoleId } from "./types";

export type RolePool = Record<RoleId, boolean>;

export type FactionSeats = Record<Faction, number>;

export const FACTION_ROLE_IDS: Record<Faction, readonly RoleId[]> = {
  mafia: ROLE_IDS.filter((roleId) => ROLE_META[roleId].faction === "mafia"),
  town: ROLE_IDS.filter((roleId) => ROLE_META[roleId].faction === "town"),
  neutral: ROLE_IDS.filter(
    (roleId) => ROLE_META[roleId].faction === "neutral",
  ),
};

const FALLBACK_ROLE: Record<Faction, RoleId> = {
  mafia: "framer",
  town: "villager",
  neutral: "jester",
};

/** Every role is eligible. Default tab behavior. */
export function createFullRolePool(): RolePool {
  return Object.fromEntries(
    ROLE_IDS.map((roleId) => [roleId, true]),
  ) as RolePool;
}

export function emptyRoleCounts(): Record<RoleId, number> {
  return Object.fromEntries(ROLE_IDS.map((roleId) => [roleId, 0])) as Record<
    RoleId,
    number
  >;
}

export function enabledRoles(
  pool: RolePool,
  faction: Faction,
): RoleId[] {
  return FACTION_ROLE_IDS[faction].filter((roleId) => pool[roleId]);
}

/**
 * Maximum number of seats fillable without repeating a role. The Godfather
 * always fills one mafia seat and can never be duplicated.
 */
function uniqueCapacity(pool: RolePool, faction: Faction): number {
  if (faction === "mafia") {
    const fillers = enabledRoles(pool, "mafia").filter(
      (roleId) => roleId !== "godfather",
    );
    return 1 + fillers.length;
  }
  return enabledRoles(pool, faction).length;
}

/** True when at least one faction cannot be filled without duplicates. */
export function requiresDuplicates(
  seats: FactionSeats,
  pool: RolePool,
): boolean {
  return (["mafia", "town", "neutral"] as const).some(
    (faction) =>
      seats[faction] > 0 && uniqueCapacity(pool, faction) < seats[faction],
  );
}

/**
 * False when turning this role off would leave its faction unable to seat
 * every player. The Godfather is always locked on.
 */
export function canDisableRole(
  roleId: RoleId,
  seats: FactionSeats,
  pool: RolePool,
): boolean {
  if (roleId === "godfather") return false;

  const next: RolePool = { ...pool, [roleId]: false };
  const faction = ROLE_META[roleId].faction;

  if (seats[faction] <= 0) return true;
  if (faction === "mafia") {
    const fillers = enabledRoles(next, "mafia").filter(
      (id) => id !== "godfather",
    );
    return seats[faction] <= 1 || fillers.length > 0;
  }
  return enabledRoles(next, faction).length > 0;
}

export interface ResolveRoleCountsInput {
  seats: FactionSeats;
  pool: RolePool;
  allowDuplicates: boolean;
  random?: () => number;
}

export interface ResolveRoleCountsResult {
  roleCounts: Record<RoleId, number>;
  duplicatesForced: boolean;
}

function randomIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.floor(random() * length));
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1, random);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * Randomly fills every faction's seats from its eligible pool.
 *
 * - Godfather is always exactly one while the mafia has seats.
 * - With duplicates off (and enough distinct roles), each role appears once.
 * - With duplicates on, seats are filled with replacement from the pool.
 * - Over-selected pools naturally produce a random subset.
 */
export function resolveRoleCounts({
  seats,
  pool: requestedPool,
  allowDuplicates,
  random = Math.random,
}: ResolveRoleCountsInput): ResolveRoleCountsResult {
  const pool: RolePool = { ...requestedPool, godfather: true };
  const duplicatesForced = requiresDuplicates(seats, pool);
  const useDuplicates = allowDuplicates || duplicatesForced;
  const roleCounts = emptyRoleCounts();

  const mafiaSeats = Math.max(0, seats.mafia);
  if (mafiaSeats > 0) {
    roleCounts.godfather = 1;

    const fillers = enabledRoles(pool, "mafia").filter(
      (roleId) => roleId !== "godfather",
    );
    const remaining = mafiaSeats - 1;

    if (remaining > 0) {
      if (fillers.length === 0) {
        roleCounts[FALLBACK_ROLE.mafia] += remaining;
      } else if (useDuplicates) {
        for (let index = 0; index < remaining; index += 1) {
          const roleId = fillers[randomIndex(fillers.length, random)];
          roleCounts[roleId] += 1;
        }
      } else {
        const picks = shuffled(fillers, random).slice(0, remaining);
        for (const roleId of picks) {
          roleCounts[roleId] += 1;
        }
      }
    }
  }

  for (const faction of ["town", "neutral"] as const) {
    const factionSeats = Math.max(0, seats[faction]);
    if (factionSeats === 0) continue;

    const eligible = enabledRoles(pool, faction);
    const usable =
      eligible.length > 0 ? eligible : [FALLBACK_ROLE[faction]];

    if (useDuplicates) {
      for (let index = 0; index < factionSeats; index += 1) {
        const roleId = usable[randomIndex(usable.length, random)];
        roleCounts[roleId] += 1;
      }
      continue;
    }

    const picks = shuffled(usable, random).slice(0, factionSeats);
    for (const roleId of picks) {
      roleCounts[roleId] += 1;
    }
  }

  return { roleCounts, duplicatesForced };
}
