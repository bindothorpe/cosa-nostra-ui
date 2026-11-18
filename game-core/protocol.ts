import { z } from "zod";
import { ROLE_IDS } from "./config";
import type { ClientFrame, ServerFrame } from "./types";

const factionValues = ["mafia", "town", "neutral"] as const;
const phaseValues = [
  "lobby",
  "roleReveal",
  "night",
  "nightReport",
  "dayDiscussion",
  "voting",
  "voteResult",
  "gameOver",
] as const;
const nightActionKindValues = [
  "kill",
  "frame",
  "investigate",
  "protect",
  "guard",
  "roleblock",
  "shoot",
] as const;
const tieRuleValues = ["no-elimination", "random", "revote"] as const;
const alertKindValues = [
  "kill",
  "saved",
  "blocked",
  "investigation",
  "vote",
  "system",
  "win",
] as const;
const rolePresetValues = ["default", "custom"] as const;

export const playerIdSchema = z.string().min(1);
export const roomCodeSchema = z.string().min(1);
export const roleIdSchema = z.enum(ROLE_IDS);
export const factionSchema = z.enum(factionValues);
export const phaseSchema = z.enum(phaseValues);
export const nightActionKindSchema = z.enum(nightActionKindValues);
export const tieRuleSchema = z.enum(tieRuleValues);

export const paramsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);

export const nightActionSchema = z
  .object({
    kind: nightActionKindSchema,
    targetId: playerIdSchema,
    submittedAt: z.number(),
  })
  .strict();

export const roleCountsSchema = z
  .object({
    godfather: z.number().int().nonnegative(),
    consigliere: z.number().int().nonnegative(),
    framer: z.number().int().nonnegative(),
    detective: z.number().int().nonnegative(),
    doctor: z.number().int().nonnegative(),
    bodyguard: z.number().int().nonnegative(),
    roleblocker: z.number().int().nonnegative(),
    vigilante: z.number().int().nonnegative(),
    mayor: z.number().int().nonnegative(),
    villager: z.number().int().nonnegative(),
    jester: z.number().int().nonnegative(),
    executioner: z.number().int().nonnegative(),
  })
  .strict();

export const phaseDurationsSchema = z
  .object({
    roleReveal: z.number(),
    night: z.number(),
    nightReport: z.number(),
    dayDiscussion: z.number(),
    voting: z.number(),
    voteResult: z.number(),
  })
  .strict();

export const roomConfigSchema = z
  .object({
    rolePreset: z.enum(rolePresetValues),
    minPlayers: z.number().int(),
    maxPlayers: z.number().int(),
    roleCounts: roleCountsSchema,
    phaseDurations: phaseDurationsSchema,
    whisperBudget: z.number().int(),
    tieRule: tieRuleSchema,
    revealRoleOnVote: z.boolean(),
  })
  .strict();

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setReady") }).strict(),
  z.object({ type: z.literal("unsetReady") }).strict(),
  z.object({ type: z.literal("startGame") }).strict(),
  z
    .object({
      type: z.literal("submitNightAction"),
      kind: nightActionKindSchema,
      targetId: playerIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("castVote"),
      targetId: playerIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("sendWhisper"),
      toPlayerId: playerIdSchema,
      text: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("sendGraveyardMessage"),
      text: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("updateConfig"),
      config: roomConfigSchema,
    })
    .strict(),
  z.object({ type: z.literal("leaveRoom") }).strict(),
  z.object({ type: z.literal("rematch") }).strict(),
]);

export const helloFrameSchema = z
  .object({
    type: z.literal("hello"),
    code: roomCodeSchema,
    token: z.string().min(1),
  })
  .strict();

export const commandFrameSchema = z
  .object({
    type: z.literal("command"),
    id: z.string().min(1),
    command: commandSchema,
  })
  .strict();

export const pingFrameSchema = z
  .object({
    type: z.literal("ping"),
    t: z.number(),
  })
  .strict();

export const clientFrameSchema = z.discriminatedUnion("type", [
  helloFrameSchema,
  commandFrameSchema,
  pingFrameSchema,
]);

export const winnerSchema = z.discriminatedUnion("faction", [
  z.object({ faction: z.literal("mafia") }).strict(),
  z.object({ faction: z.literal("town") }).strict(),
  z
    .object({
      faction: z.literal("neutral"),
      playerId: playerIdSchema,
      reason: z.enum(["jester", "executioner"]),
    })
    .strict(),
]);

export const playerSummarySchema = z
  .object({
    id: playerIdSchema,
    name: z.string(),
    alive: z.boolean(),
    connected: z.boolean(),
    isYou: z.boolean(),
    color: z.string(),
    roleId: roleIdSchema.nullable(),
    faction: factionSchema.nullable(),
  })
  .strict();

export const publicRoomConfigSchema = z
  .object({
    rolePreset: z.enum(rolePresetValues),
    minPlayers: z.number().int(),
    maxPlayers: z.number().int(),
    phaseDurations: phaseDurationsSchema,
    whisperBudget: z.number().int(),
    tieRule: tieRuleSchema,
    revealRoleOnVote: z.boolean(),
  })
  .strict();

export const whisperMessageSchema = z
  .object({
    id: z.string(),
    threadId: z.string(),
    fromPlayerId: playerIdSchema,
    text: z.string(),
    at: z.number(),
  })
  .strict();

export const whisperThreadViewSchema = z
  .object({
    id: z.string(),
    participantIds: z.tuple([playerIdSchema, playerIdSchema]),
    messages: z.array(whisperMessageSchema),
  })
  .strict();

export const graveyardMessageSchema = z
  .object({
    id: z.string(),
    playerId: playerIdSchema,
    text: z.string(),
    at: z.number(),
  })
  .strict();

export const alertSchema = z
  .object({
    id: z.string(),
    kind: z.enum(alertKindValues),
    round: z.number().int(),
    titleKey: z.string(),
    detailKey: z.string(),
    params: paramsSchema.optional(),
    at: z.number(),
  })
  .strict();

export const nightReportViewSchema = z
  .object({
    deaths: z.array(playerIdSchema),
  })
  .strict();

export const mafiaKillViewSchema = z
  .object({
    actorId: playerIdSchema,
    kind: z.literal("kill"),
    targetId: playerIdSchema,
    submittedAt: z.number(),
  })
  .strict();

export const playerViewSchema = z
  .object({
    code: roomCodeSchema,
    version: z.number().int(),
    serverNow: z.number(),
    phase: phaseSchema,
    round: z.number().int(),
    phaseEndsAt: z.number().nullable(),
    hostId: playerIdSchema,
    isHost: z.boolean(),
    config: publicRoomConfigSchema,
    hostConfig: roomConfigSchema.optional(),
    you: playerSummarySchema,
    players: z.array(playerSummarySchema),
    livingCount: z.number().int(),
    readyIds: z.array(playerIdSchema),
    waitingCount: z.number().int(),
    yourRole: roleIdSchema,
    yourFaction: factionSchema,
    yourAction: nightActionSchema.nullable(),
    yourTarget: playerSummarySchema.nullable(),
    yourShotsLeft: z.number().int().nonnegative(),
    mafiaKill: mafiaKillViewSchema.nullable().optional(),
    yourVote: playerIdSchema.nullable(),
    voteTally: z.record(z.string(), z.number()).nullable(),
    eliminatedIds: z.array(playerIdSchema),
    winner: winnerSchema.nullable(),
    whispers: z.array(whisperThreadViewSchema),
    whispersLeft: z.number().int(),
    graveyard: z.array(graveyardMessageSchema),
    alerts: z.array(alertSchema),
    nightReport: nightReportViewSchema.nullable(),
    canStart: z.boolean(),
    canAct: z.boolean(),
    canVote: z.boolean(),
  })
  .strict();

export const syncFrameSchema = z
  .object({
    type: z.literal("sync"),
    version: z.number().int(),
    serverNow: z.number(),
    ackId: z.string().optional(),
    view: playerViewSchema,
  })
  .strict();

export const pongFrameSchema = z
  .object({
    type: z.literal("pong"),
    t: z.number(),
    serverNow: z.number(),
  })
  .strict();

export const errorFrameSchema = z
  .object({
    type: z.literal("error"),
    id: z.string().optional(),
    code: z.string(),
    messageKey: z.string(),
    params: paramsSchema.optional(),
  })
  .strict();

export const serverFrameSchema = z.discriminatedUnion("type", [
  syncFrameSchema,
  pongFrameSchema,
  errorFrameSchema,
]);

export function parseClientFrame(raw: unknown): ClientFrame {
  return clientFrameSchema.parse(raw);
}

export function parseServerFrame(raw: unknown): ServerFrame {
  return serverFrameSchema.parse(raw);
}
