export type Faction = "mafia" | "town" | "neutral";

export type RoleId =
  | "godfather"
  | "consigliere"
  | "framer"
  | "detective"
  | "doctor"
  | "bodyguard"
  | "roleblocker"
  | "vigilante"
  | "mayor"
  | "villager"
  | "jester"
  | "executioner";

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

export type DayActionKind = "reveal";

export type RoleComplexity = "simple" | "medium" | "complex";

export interface RoleDef {
  faction: Faction;
  abilityPhase: AbilityPhase;
  complexity: RoleComplexity;
}

export type FactionCounts = Record<Faction, number>;

export type ConfigurablePhase = Exclude<Phase, "lobby" | "gameOver">;

export type PhaseDurations = Record<ConfigurablePhase, number>;

export type RoomPreset = "default" | "custom";

export interface RoomConfig {
  playerCount: number;
  factionPreset: RoomPreset;
  factionCounts: FactionCounts;
  roleCounts: Record<RoleId, number>;
  timerPreset: RoomPreset;
  phaseDurations: PhaseDurations;
}

export interface Player {
  id: string;
  name: string;
  roleId: RoleId;
  faction: Faction;
  alive: boolean;
  isYou?: boolean;
  color: string;
  /** Role made public by a day action, if any. */
  publicRoleId?: RoleId | null;
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
  params?: Record<string, string | number>;
  at: number;
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
  roomCode: string;
  isHost: boolean;
  allowComplexRoles: boolean;
  roomConfig: RoomConfig;
  players: Player[];
  actionTargets: string[];
  actionDone: boolean;
  readyIds: string[];
  yourVote: string | null;
  voteTally: Record<string, number> | null;
  eliminatedId: string | null;
  winnerFaction: Faction | null;
  whispers: WhisperThread[];
  whispersLeft: number;
  alerts: GameAlert[];
  graveyard: GraveyardMessage[];
  graveyardUnread: number;
  /** Day actions currently available to the viewer. */
  yourDayActions: DayActionKind[];
  /** Executioner's assigned target, when the player has one. */
  targetName?: string;
  /** Vigilante's remaining shots. */
  shotsLeft?: number;
  /** Live mode only: whether the host may start the game right now. */
  canStart?: boolean;
}
