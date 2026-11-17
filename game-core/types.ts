export type PlayerId = string;

export type RoomCode = string;

export type RoleId =
  | "godfather"
  | "framer"
  | "detective"
  | "doctor"
  | "villager"
  | "jester";

export type Faction = "mafia" | "town" | "neutral";

export type Phase =
  | "lobby"
  | "roleReveal"
  | "night"
  | "nightReport"
  | "dayDiscussion"
  | "voting"
  | "voteResult"
  | "gameOver";

export type ConfigurablePhase = Exclude<Phase, "lobby" | "gameOver">;

export type NightActionKind = "kill" | "frame" | "investigate" | "protect";

export type TieRule = "no-elimination" | "random" | "revote";

export type EliminationCause = "night" | "vote";

export type AlertKind =
  | "kill"
  | "saved"
  | "investigation"
  | "vote"
  | "system"
  | "win";

export interface ServerPlayer {
  id: PlayerId;
  tokenHash: string;
  name: string;
  roleId: RoleId;
  faction: Faction;
  alive: boolean;
  connected: boolean;
  joinedAt: number;
  color: string;
  eliminatedAt?: { phase: Phase; round: number; cause: EliminationCause };
}

export interface WhisperMessage {
  id: string;
  threadId: string;
  fromPlayerId: PlayerId;
  text: string;
  at: number;
}

export interface WhisperThread {
  id: string;
  participantIds: [PlayerId, PlayerId];
  messages: WhisperMessage[];
}

export interface GraveyardMessage {
  id: string;
  playerId: PlayerId;
  text: string;
  at: number;
}

export interface GameAlert {
  id: string;
  kind: AlertKind;
  round: number;
  titleKey: string;
  detailKey: string;
  params?: Record<string, string | number>;
  at: number;
}

export interface RoomConfig {
  rolePreset: "default" | "custom";
  minPlayers: number;
  maxPlayers: number;
  roleCounts: Record<RoleId, number>;
  phaseDurations: Record<ConfigurablePhase, number>;
  whisperBudget: number;
  tieRule: TieRule;
  revealRoleOnVote: boolean;
}

export interface NightAction {
  kind: NightActionKind;
  targetId: PlayerId;
  submittedAt: number;
}

export interface NightResult {
  deaths: PlayerId[];
  saved: PlayerId[];
  investigations: Record<PlayerId, "mafia" | "not-mafia">;
}

export type Winner =
  | { faction: "mafia" }
  | { faction: "town" }
  | { faction: "neutral"; playerId: PlayerId; reason: "jester" };

export interface NightReportView {
  deaths: PlayerId[];
}

export interface RoomState {
  schemaVersion: 1;
  code: RoomCode;
  hostId: PlayerId;
  phase: Phase;
  round: number;
  phaseEndsAt: number | null;
  createdAt: number;
  updatedAt: number;
  version: number;
  seed: number;
  config: RoomConfig;
  players: ServerPlayer[];
  readyIds: PlayerId[];
  nightActions: Record<PlayerId, NightAction | undefined>;
  votes: Record<PlayerId, PlayerId | null>;
  voteTally: Record<PlayerId, number> | null;
  revoteUsed: boolean;
  revoteCandidates: PlayerId[] | null;
  eliminatedIds: PlayerId[];
  winner: Winner | null;
  whispers: WhisperThread[];
  whispersSentThisDay: Record<PlayerId, number>;
  graveyard: GraveyardMessage[];
  alertsByPlayer: Record<PlayerId, GameAlert[]>;
  pendingNightResult: NightResult | null;
}

export interface PlayerSummary {
  id: PlayerId;
  name: string;
  alive: boolean;
  connected: boolean;
  isYou: boolean;
  color: string;
  roleId: RoleId | null;
  faction: Faction | null;
}

export interface PublicRoomConfig {
  rolePreset: "default" | "custom";
  minPlayers: number;
  maxPlayers: number;
  phaseDurations: Record<ConfigurablePhase, number>;
  whisperBudget: number;
  tieRule: TieRule;
  revealRoleOnVote: boolean;
}

export interface WhisperThreadView {
  id: string;
  participantIds: [PlayerId, PlayerId];
  messages: WhisperMessage[];
}

export interface MafiaKillView {
  actorId: PlayerId;
  kind: "kill";
  targetId: PlayerId;
  submittedAt: number;
}

export interface PlayerView {
  code: RoomCode;
  version: number;
  serverNow: number;
  phase: Phase;
  round: number;
  phaseEndsAt: number | null;
  hostId: PlayerId;
  isHost: boolean;
  config: PublicRoomConfig;
  hostConfig?: RoomConfig;
  you: PlayerSummary;
  players: PlayerSummary[];
  livingCount: number;
  readyIds: PlayerId[];
  waitingCount: number;
  yourRole: RoleId;
  yourFaction: Faction;
  yourAction: NightAction | null;
  mafiaKill?: MafiaKillView | null;
  yourVote: PlayerId | null;
  voteTally: Record<PlayerId, number> | null;
  eliminatedIds: PlayerId[];
  winner: Winner | null;
  whispers: WhisperThreadView[];
  whispersLeft: number;
  graveyard: GraveyardMessage[];
  alerts: GameAlert[];
  nightReport: NightReportView | null;
  canStart: boolean;
  canAct: boolean;
  canVote: boolean;
}

export type EngineErrorCode =
  | "PLAYER_NOT_FOUND"
  | "PLAYER_EXISTS"
  | "NOT_HOST"
  | "WRONG_PHASE"
  | "NOT_ALIVE"
  | "NOT_DEAD"
  | "NOT_YOUR_TURN"
  | "NOT_AUTHORISED"
  | "INVALID_TARGET"
  | "INVALID_ACTION"
  | "INVALID_TEXT"
  | "INVALID_NAME"
  | "NAME_TAKEN"
  | "ROOM_FULL"
  | "GAME_STARTED"
  | "INVALID_CONFIG"
  | "NOT_ENOUGH_PLAYERS"
  | "TOO_MANY_PLAYERS"
  | "ROLE_COUNT_MISMATCH"
  | "BUDGET_EXHAUSTED"
  | "LAST_PLAYER"
  | "NOT_IMPLEMENTED"
  | "UNKNOWN_COMMAND";

export interface EngineError {
  code: EngineErrorCode;
  messageKey: string;
  params?: Record<string, string | number>;
}

export type Command =
  | { type: "setReady" }
  | { type: "unsetReady" }
  | { type: "startGame" }
  | {
      type: "submitNightAction";
      kind: NightActionKind;
      targetId: PlayerId;
    }
  | { type: "castVote"; targetId: PlayerId }
  | { type: "sendWhisper"; toPlayerId: PlayerId; text: string }
  | { type: "sendGraveyardMessage"; text: string }
  | { type: "updateConfig"; config: RoomConfig }
  | { type: "leaveRoom" }
  | { type: "rematch" };

export interface HelloFrame {
  type: "hello";
  code: RoomCode;
  token: string;
}

export interface CommandFrame {
  type: "command";
  id: string;
  command: Command;
}

export interface PingFrame {
  type: "ping";
  t: number;
}

export type ClientFrame = HelloFrame | CommandFrame | PingFrame;

export interface SyncFrame {
  type: "sync";
  version: number;
  serverNow: number;
  ackId?: string;
  view: PlayerView;
}

export interface PongFrame {
  type: "pong";
  t: number;
  serverNow: number;
}

export interface ErrorFrame {
  type: "error";
  id?: string;
  code: string;
  messageKey: string;
  params?: Record<string, string | number>;
}

export type ServerFrame = SyncFrame | PongFrame | ErrorFrame;

export type ReduceResult =
  | { ok: true; state: RoomState }
  | { ok: false; error: EngineError };
