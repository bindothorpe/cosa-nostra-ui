import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type {
  BugReport,
  CheckRoomRequest,
  CreateRoomRequest,
  HealthInfo,
  JoinRoomRequest,
  RoomAvailability,
  RoomIdentity,
} from "./api-types";
import type { Env } from "./env";
import { RealtimeError, forbidden, tooManyRequests } from "./errors";
import { FixedWindowLimiter } from "./rate-limit";
import type { Logger } from "./logger";

export interface RoomApi {
  create(input: CreateRoomRequest): Promise<RoomIdentity>;
  join(code: string, name: string, token?: string): Promise<RoomIdentity>;
  check(code: string, token?: string): RoomAvailability;
  health(): HealthInfo;
}

export interface BugApi {
  add(message: string): Promise<BugReport>;
  list(): BugReport[];
}

export interface HttpDeps {
  api: RoomApi;
  bugs: BugApi;
  env: Env;
  logger: Logger;
  version: string;
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(20),
  config: z.unknown(),
});

const JoinSchema = z.object({
  name: z.string().trim().min(1).max(20),
  token: z.string().min(1).max(512).optional(),
});

const CheckSchema = z.object({
  token: z.string().min(1).max(512).optional(),
});

const BugSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

const MAX_BODY_BYTES = 16 * 1024;
const ROOM_PATH = /^\/(?:rt\/)?rooms\/([A-Za-z0-9]{5})\/(join|check)$/;

/**
 * Coolify strips a configured path prefix by default. Accept both `/rt/*` and
 * the stripped form so one domain can route the UI and the realtime service.
 */
export function canonicalPath(pathname: string): string {
  if (pathname === "/rt") return "/";
  if (pathname.startsWith("/rt/")) return pathname.slice(3);
  return pathname;
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  origin?: string,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    ...corsHeaders(origin),
  });
  response.end(payload);
}

function sendError(
  response: ServerResponse,
  error: RealtimeError,
  origin?: string,
): void {
  sendJson(
    response,
    error.status,
    {
      error: error.code,
      messageKey: error.messageKey,
      params: error.params,
    },
    origin,
  );
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new RealtimeError(413, "BODY_TOO_LARGE", "Errors.bodyTooLarge");
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RealtimeError(400, "INVALID_JSON", "Errors.invalidJson");
  }
}

function clientIp(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (value) return value.split(",")[0].trim();
  }
  return request.socket.remoteAddress ?? "unknown";
}

function allowedOrigin(
  request: IncomingMessage,
  env: Env,
): { origin: string | undefined; allowed: boolean } {
  const raw = request.headers.origin;
  const origin = Array.isArray(raw) ? raw[0] : raw;
  if (!origin) return { origin: undefined, allowed: true };
  return { origin, allowed: env.allowedOrigins.includes(origin) };
}

export function createHttpHandler(deps: HttpDeps) {
  const createLimiter = new FixedWindowLimiter(5, 60 * 60_000);
  const joinLimiter = new FixedWindowLimiter(10, 60_000);
  const checkLimiter = new FixedWindowLimiter(30, 60_000);
  const bugLimiter = new FixedWindowLimiter(5, 60_000);

  return async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const { origin, allowed } = allowedOrigin(request, deps.env);
    const url = new URL(request.url ?? "/", "http://localhost");
    const rawPath = url.pathname;
    const pathname = canonicalPath(rawPath);

    if (request.method === "OPTIONS") {
      if (!allowed) {
        sendError(
          response,
          forbidden("ORIGIN_NOT_ALLOWED", "Errors.originNotAllowed"),
          origin,
        );
        return;
      }
      response.writeHead(204, corsHeaders(origin));
      response.end();
      return;
    }

    try {
      if (pathname === "/health" && request.method === "GET") {
        sendJson(response, 200, deps.api.health(), origin);
        return;
      }

      if (pathname === "/bugs" && request.method === "GET") {
        sendJson(response, 200, { bugs: deps.bugs.list() }, origin);
        return;
      }

      if (pathname === "/bugs" && request.method === "POST") {
        if (!allowed) {
          throw forbidden("ORIGIN_NOT_ALLOWED", "Errors.originNotAllowed");
        }

        const ip = clientIp(request, deps.env.trustProxy);
        if (!bugLimiter.allow(ip)) {
          throw tooManyRequests("BUG_RATE_LIMIT", "Errors.rateLimit");
        }

        const parsed = BugSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          throw new RealtimeError(400, "INVALID_BODY", "Errors.invalidBody");
        }

        const report = await deps.bugs.add(parsed.data.message);
        sendJson(response, 201, report, origin);
        return;
      }

      if (pathname === "/rooms" && request.method === "POST") {
        if (!allowed) {
          throw forbidden("ORIGIN_NOT_ALLOWED", "Errors.originNotAllowed");
        }

        const ip = clientIp(request, deps.env.trustProxy);
        if (!createLimiter.allow(ip)) {
          throw tooManyRequests(
            "ROOM_CREATE_RATE_LIMIT",
            "Errors.roomCreateRateLimit",
          );
        }

        const parsed = CreateSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          throw new RealtimeError(
            400,
            "INVALID_BODY",
            "Errors.invalidBody",
          );
        }

        const identity = await deps.api.create(
          parsed.data as CreateRoomRequest,
        );
        sendJson(response, 201, identity, origin);
        return;
      }

      const roomMatch = ROOM_PATH.exec(pathname);
      if (roomMatch && request.method === "POST") {
        if (!allowed) {
          throw forbidden("ORIGIN_NOT_ALLOWED", "Errors.originNotAllowed");
        }

        const code = roomMatch[1].toUpperCase();
        const action = roomMatch[2];
        const ip = clientIp(request, deps.env.trustProxy);

        if (action === "check") {
          if (!checkLimiter.allow(`${ip}:${code}`)) {
            throw tooManyRequests(
              "ROOM_CHECK_RATE_LIMIT",
              "Errors.roomCheckRateLimit",
            );
          }

          const parsed = CheckSchema.safeParse(await readJson(request));
          if (!parsed.success) {
            throw new RealtimeError(
              400,
              "INVALID_BODY",
              "Errors.invalidBody",
            );
          }

          const availability = deps.api.check(
            code,
            (parsed.data as CheckRoomRequest).token,
          );
          sendJson(response, 200, availability, origin);
          return;
        }

        if (!joinLimiter.allow(`${ip}:${code}`)) {
          throw tooManyRequests(
            "JOIN_RATE_LIMIT",
            "Errors.joinRateLimit",
          );
        }

        const parsed = JoinSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          throw new RealtimeError(
            400,
            "INVALID_BODY",
            "Errors.invalidBody",
          );
        }

        const body = parsed.data as JoinRoomRequest;
        const identity = await deps.api.join(code, body.name, body.token);
        sendJson(response, 200, identity, origin);
        return;
      }

      sendJson(
        response,
        404,
        { error: "NOT_FOUND", messageKey: "Errors.notFound" },
        origin,
      );
    } catch (error) {
      if (error instanceof RealtimeError) {
        sendError(response, error, origin);
        return;
      }

      deps.logger.error("http.unhandled_error", {
        path: rawPath,
        error: error instanceof Error ? error.stack : String(error),
      });
      sendError(
        response,
        new RealtimeError(500, "INTERNAL", "Errors.internal"),
        origin,
      );
    }
  };
}
