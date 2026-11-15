export type Faction = "mafia" | "town" | "neutral";

export type RoleId =
  | "godfather"
  | "framer"
  | "detective"
  | "doctor"
  | "villager"
  | "jester";

export type Phase =
  | "lobby"
  | "roleReveal"
  | "night"
  | "nightReport"
  | "dayDiscussion"
  | "voting"
  | "voteResult"
  | "gameOver";

export type AbilityPhase = "night" | "day" | "passive";

export interface RoleDef {
  faction: Faction;
  abilityPhase: AbilityPhase;
}

export interface Player {
  id: string;
  name: string;
  roleId: RoleId;
  faction: Faction;
  alive: boolean;
  isYou?: boolean;
  color: string;
}

export interface WhisperMessage {
  id: string;
  from: "you" | "them";
  text?: string;
  textKey?: string;
  time: string;
}

export interface WhisperThread {
  playerId: string;
  unread: number;
  messages: WhisperMessage[];
}

export type AlertKind =
  | "kill"
  | "blocked"
  | "investigation"
  | "system"
  | "vote"
  | "win";

export interface GameAlert {
  id: string;
  kind: AlertKind;
  night: number;
  read: boolean;
  titleKey: string;
  detailKey: string;
}

export interface GraveyardMessage {
  id: string;
  playerId: string;
  text?: string;
  textKey?: string;
  time: string;
}

export interface GameState {
  phase: Phase;
  phaseEndsAt: number | null;
  round: number;
  joined: boolean;
  playerName: string;
  players: Player[];
  actionTargets: string[];
  actionDone: boolean;
  yourVote: string | null;
  voteTally: Record<string, number> | null;
  eliminatedId: string | null;
  winnerFaction: Faction | null;
  whispers: WhisperThread[];
  whispersLeft: number;
  alerts: GameAlert[];
  graveyard: GraveyardMessage[];
  graveyardUnread: number;
}
