import type {
  GameAlert,
  GameState,
  Player,
  RoleDef,
  RoleId,
  WhisperThread,
} from "./types";

export const ROOM_CODE = "CNSA-7Q2";
export const MAX_PLAYERS = 12;
export const YOU_ID = "you";
export const WHISPERS_PER_DAY = 3;

export const ROLES: Record<RoleId, RoleDef> = {
  godfather: { faction: "mafia", abilityPhase: "night" },
  framer: { faction: "mafia", abilityPhase: "night" },
  detective: { faction: "town", abilityPhase: "night" },
  doctor: { faction: "town", abilityPhase: "night" },
  villager: { faction: "town", abilityPhase: "passive" },
  jester: { faction: "neutral", abilityPhase: "passive" },
};

export const PLAYER_SEED: Player[] = [
  {
    id: YOU_ID,
    name: "Alessia",
    roleId: "framer",
    faction: "mafia",
    alive: true,
    isYou: true,
    color: "bg-rose-500/15 text-rose-300",
  },
  {
    id: "sofia",
    name: "Sofia",
    roleId: "godfather",
    faction: "mafia",
    alive: true,
    color: "bg-amber-500/15 text-amber-300",
  },
  {
    id: "marco",
    name: "Marco",
    roleId: "villager",
    faction: "town",
    alive: true,
    color: "bg-sky-500/15 text-sky-300",
  },
  {
    id: "lucia",
    name: "Lucia",
    roleId: "villager",
    faction: "town",
    alive: true,
    color: "bg-emerald-500/15 text-emerald-300",
  },
  {
    id: "enzo",
    name: "Enzo",
    roleId: "doctor",
    faction: "town",
    alive: true,
    color: "bg-violet-500/15 text-violet-300",
  },
  {
    id: "giulia",
    name: "Giulia",
    roleId: "villager",
    faction: "town",
    alive: true,
    color: "bg-orange-500/15 text-orange-300",
  },
  {
    id: "matteo",
    name: "Matteo",
    roleId: "jester",
    faction: "neutral",
    alive: true,
    color: "bg-teal-500/15 text-teal-300",
  },
  {
    id: "chiara",
    name: "Chiara",
    roleId: "villager",
    faction: "town",
    alive: true,
    color: "bg-fuchsia-500/15 text-fuchsia-300",
  },
  {
    id: "luca",
    name: "Luca",
    roleId: "villager",
    faction: "town",
    alive: true,
    color: "bg-lime-500/15 text-lime-300",
  },
  {
    id: "bianca",
    name: "Bianca",
    roleId: "villager",
    faction: "town",
    alive: true,
    color: "bg-cyan-500/15 text-cyan-300",
  },
  {
    id: "rocco",
    name: "Rocco",
    roleId: "villager",
    faction: "town",
    alive: true,
    color: "bg-indigo-500/15 text-indigo-300",
  },
  {
    id: "elena",
    name: "Elena",
    roleId: "villager",
    faction: "town",
    alive: true,
    color: "bg-pink-500/15 text-pink-300",
  },
];

export const WHISPER_SEED: WhisperThread[] = [
  {
    playerId: "sofia",
    unread: 1,
    messages: [
      {
        id: "w-sofia-1",
        from: "them",
        textKey: "seed.sofia1",
        time: "09:41",
      },
    ],
  },
  {
    playerId: "lucia",
    unread: 0,
    messages: [
      {
        id: "w-lucia-1",
        from: "you",
        text: "If I'm gone tomorrow, look at Sofia.",
        time: "09:38",
      },
      {
        id: "w-lucia-2",
        from: "them",
        textKey: "seed.lucia2",
        time: "09:39",
      },
    ],
  },
  {
    playerId: "enzo",
    unread: 1,
    messages: [
      {
        id: "w-enzo-1",
        from: "them",
        textKey: "seed.enzo1",
        time: "09:44",
      },
    ],
  },
];

export const ALERT_SEED: GameAlert[] = [
  {
    id: "alert-kill",
    kind: "kill",
    night: 1,
    read: false,
    titleKey: "Alerts.seed.killedTitle",
    detailKey: "Alerts.seed.killedBody",
  },
  {
    id: "alert-blocked",
    kind: "blocked",
    night: 1,
    read: false,
    titleKey: "Alerts.seed.blockedTitle",
    detailKey: "Alerts.seed.blockedBody",
  },
  {
    id: "alert-investigation",
    kind: "investigation",
    night: 1,
    read: true,
    titleKey: "Alerts.seed.investigatedTitle",
    detailKey: "Alerts.seed.investigatedBody",
  },
  {
    id: "alert-night",
    kind: "system",
    night: 1,
    read: true,
    titleKey: "Alerts.seed.nightTitle",
    detailKey: "Alerts.seed.nightBody",
  },
  {
    id: "alert-vote",
    kind: "vote",
    night: 1,
    read: true,
    titleKey: "Alerts.seed.voteTitle",
    detailKey: "Alerts.seed.voteBody",
  },
];

export const BASE_VOTE_TALLY: Record<string, number> = {
  sofia: 4,
  marco: 4,
  giulia: 1,
  matteo: 1,
};

export const INITIAL_STATE: GameState = {
  phase: "lobby",
  round: 1,
  joined: false,
  playerName: "Alessia",
  players: PLAYER_SEED,
  actionTarget: null,
  actionDone: false,
  yourVote: null,
  voteTally: null,
  eliminatedId: null,
  winnerFaction: null,
  whispers: WHISPER_SEED,
  whispersLeft: WHISPERS_PER_DAY,
  alerts: ALERT_SEED,
};

export function playerName(players: Player[], id: string | null): string {
  if (!id) return "";
  return players.find((player) => player.id === id)?.name ?? "";
}
