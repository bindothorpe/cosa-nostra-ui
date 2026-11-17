import { ApiError } from "./api";

export type JoinFailure =
  | "roomNotFound"
  | "roomFull"
  | "gameStarted"
  | "checkFailed";

/** Map an availability-check failure to a landing-page error key. */
export function joinFailureFrom(error: unknown): JoinFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "ROOM_NOT_FOUND":
        return "roomNotFound";
      case "ROOM_FULL":
        return "roomFull";
      case "GAME_STARTED":
        return "gameStarted";
    }
  }

  return "checkFailed";
}
