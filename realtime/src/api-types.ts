import type { Phase, RoomConfig } from "../../game-core/types";

export interface CreateRoomRequest {
  name: string;
  config: "default" | RoomConfig;
}

export interface JoinRoomRequest {
  name: string;
  token?: string;
}

export interface CheckRoomRequest {
  token?: string;
}

export interface RoomSeat {
  playerId: string;
  name: string;
  alive: boolean;
  phase: Phase;
  round: number;
}

export interface RoomAvailability {
  available: true;
  /** Present only when the supplied token matches a player in the room. */
  seat?: RoomSeat;
}

export interface RoomIdentity {
  code: string;
  playerId: string;
  token: string;
}

export interface HealthInfo {
  ok: boolean;
  rooms: number;
  sockets: number;
  uptimeSeconds: number;
  version: string;
}

export interface BugReport {
  id: string;
  message: string;
  createdAt: string;
}

export interface BugListResponse {
  bugs: BugReport[];
}
