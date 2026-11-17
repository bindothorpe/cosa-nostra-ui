import type { Phase, RoomConfig, RoomCode } from "@/game-core/types";

export interface ApiErrorBody {
  error: string;
  messageKey: string;
  params?: Record<string, string | number>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messageKey: string,
    readonly params?: Record<string, string | number>,
  ) {
    super(messageKey);
    this.name = "ApiError";
  }
}

export interface RoomIdentity {
  code: RoomCode;
  playerId: string;
  token: string;
}

export function realtimeBase(): string {
  const override = process.env.NEXT_PUBLIC_REALTIME_BASE;
  if (override) return override.replace(/\/$/, "");

  const scheme = window.location.protocol === "https:" ? "https:" : "http:";
  return `${scheme}//${window.location.host}/rt`;
}

export function realtimeWsUrl(): string {
  return `${realtimeBase().replace(/^http/, "ws")}/ws`;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${realtimeBase()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error from a proxy or crash.
    }

    throw new ApiError(
      response.status,
      body?.error ?? "UNKNOWN",
      body?.messageKey ?? "Errors.unknown",
      body?.params,
    );
  }

  return (await response.json()) as T;
}

export function createRoom(
  name: string,
  config: "default" | RoomConfig,
): Promise<RoomIdentity> {
  return request<RoomIdentity>("/rooms", {
    method: "POST",
    body: JSON.stringify({ name, config }),
  });
}

export function joinRoom(
  code: RoomCode,
  name: string,
  token?: string | null,
): Promise<RoomIdentity> {
  return request<RoomIdentity>(`/rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify({ name, token: token ?? undefined }),
  });
}

export interface RoomSeat {
  playerId: string;
  name: string;
  alive: boolean;
  phase: Phase;
  round: number;
}

export interface RoomAvailability {
  available: boolean;
  seat?: RoomSeat;
}

/** Read-only preflight: does the room exist, and can a fresh player join it? */
export function checkRoom(
  code: RoomCode,
  token?: string | null,
): Promise<RoomAvailability> {
  return request<RoomAvailability>(`/rooms/${encodeURIComponent(code)}/check`, {
    method: "POST",
    body: JSON.stringify({ token: token ?? undefined }),
  });
}
