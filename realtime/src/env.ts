import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().nonnegative().default(3001),
  DATA_DIR: z.string().min(1).default("./data"),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:8080"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ROOM_LOBBY_TTL_MS: z.coerce.number().int().positive().default(7_200_000),
  ROOM_GAMEOVER_TTL_MS: z.coerce.number().int().positive().default(900_000),
  SNAPSHOT_DEBOUNCE_MS: z.coerce.number().int().nonnegative().default(250),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export interface Env {
  port: number;
  dataDir: string;
  allowedOrigins: string[];
  logLevel: "debug" | "info" | "warn" | "error";
  roomLobbyTtlMs: number;
  roomGameoverTtlMs: number;
  snapshotDebounceMs: number;
  trustProxy: boolean;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.parse(source);
  return {
    port: parsed.PORT,
    dataDir: parsed.DATA_DIR,
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
    logLevel: parsed.LOG_LEVEL,
    roomLobbyTtlMs: parsed.ROOM_LOBBY_TTL_MS,
    roomGameoverTtlMs: parsed.ROOM_GAMEOVER_TTL_MS,
    snapshotDebounceMs: parsed.SNAPSHOT_DEBOUNCE_MS,
    trustProxy: parsed.TRUST_PROXY,
  };
}
