import { ROLE_META } from "./config";
import type {
  NightActionKind,
  PlayerId,
  RoleId,
  ServerPlayer,
} from "./types";

function bySeniority(first: ServerPlayer, second: ServerPlayer): number {
  if (first.joinedAt !== second.joinedAt) {
    return first.joinedAt - second.joinedAt;
  }
  if (first.id === second.id) {
    return 0;
  }
  return first.id < second.id ? -1 : 1;
}

export function isMafiaRole(roleId: RoleId): boolean {
  return ROLE_META[roleId].faction === "mafia";
}

export function isActiveRole(roleId: RoleId): boolean {
  return ROLE_META[roleId].activeAtNight;
}

export function seniorLivingMafia(
  players: readonly ServerPlayer[],
): ServerPlayer | undefined {
  return players
    .filter((player) => player.alive && player.faction === "mafia")
    .sort(bySeniority)[0];
}

/**
 * Who carries the mafia kill once the Godfather is gone. Framer outranks
 * Consigliere regardless of join order so an investigator never blocks the
 * crew's only killer.
 */
function seniorKillCandidate(
  players: readonly ServerPlayer[],
): ServerPlayer | undefined {
  const livingMafia = players.filter(
    (player) => player.alive && player.faction === "mafia",
  );
  const framers = livingMafia
    .filter((player) => player.roleId === "framer")
    .sort(bySeniority);
  if (framers.length > 0) {
    return framers[0];
  }
  return livingMafia
    .filter((player) => player.roleId === "consigliere")
    .sort(bySeniority)[0];
}

export function canFramerKill(
  players: readonly ServerPlayer[],
  framerId: PlayerId,
): boolean {
  const godfather = players.find((player) => player.roleId === "godfather");
  if (godfather?.alive) {
    return false;
  }

  return seniorKillCandidate(players)?.id === framerId;
}

export function canConsigliereKill(
  players: readonly ServerPlayer[],
  consigliereId: PlayerId,
): boolean {
  const godfather = players.find((player) => player.roleId === "godfather");
  if (godfather?.alive) {
    return false;
  }

  return seniorKillCandidate(players)?.id === consigliereId;
}

export function allowedActionKinds(
  roleId: RoleId,
  canFallbackKill: boolean,
): readonly NightActionKind[] {
  switch (roleId) {
    case "godfather":
      return ["kill"];
    case "consigliere":
      return canFallbackKill ? ["investigate", "kill"] : ["investigate"];
    case "framer":
      return canFallbackKill ? ["frame", "kill"] : ["frame"];
    case "detective":
      return ["investigate"];
    case "doctor":
      return ["protect"];
    case "bodyguard":
      return ["guard"];
    case "roleblocker":
      return ["roleblock"];
    case "vigilante":
      return ["shoot"];
    case "mayor":
    case "villager":
    case "jester":
    case "executioner":
      return [];
  }
}
