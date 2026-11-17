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

export function canFramerKill(
  players: readonly ServerPlayer[],
  framerId: PlayerId,
): boolean {
  const godfather = players.find((player) => player.roleId === "godfather");
  if (godfather?.alive) {
    return false;
  }

  return seniorLivingMafia(players)?.id === framerId;
}

export function allowedActionKinds(
  roleId: RoleId,
  framerCanKill: boolean,
): readonly NightActionKind[] {
  switch (roleId) {
    case "godfather":
      return ["kill"];
    case "framer":
      return framerCanKill ? ["frame", "kill"] : ["frame"];
    case "detective":
      return ["investigate"];
    case "doctor":
      return ["protect"];
    case "villager":
    case "jester":
      return [];
  }
}
