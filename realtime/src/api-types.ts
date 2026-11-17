import type { RoomConfig } from "../../game-core/types";

export interface CreateRoomRequest {
  name: string;
  config: "default" | RoomConfig;
}

export interface JoinRoomRequest {
  name: string;
  token?: string;
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
