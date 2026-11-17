import { WebSocket, type RawData } from "ws";
import {
  findPlayerByTokenHash,
} from "../../game-core";
import type { ClientFrame } from "../../game-core/types";
import { parseClientFrame } from "../../game-core";
import type { Logger } from "./logger";
import type { RoomRegistry } from "./room-registry";
import { hashToken } from "./token";

const HANDSHAKE_TIMEOUT_MS = 5_000;
const MAX_FRAME_BYTES = 8 * 1024;

export function attachConnection(
  socket: WebSocket,
  registry: RoomRegistry,
  logger: Logger,
): void {
  let bound: { playerId: string; roomCode: string } | null = null;

  const handshakeTimer = setTimeout(() => {
    if (bound) return;
    socket.close(4400, "hello timeout");
  }, HANDSHAKE_TIMEOUT_MS);

  socket.on("message", (data: RawData) => {
    const buffer = Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);
    const size = buffer.length;

    if (size > MAX_FRAME_BYTES) {
      socket.close(4400, "frame too large");
      return;
    }

    let frame: ClientFrame;
    try {
      frame = parseClientFrame(JSON.parse(buffer.toString("utf8")));
    } catch {
      sendError(socket, undefined, "BAD_FRAME", "Errors.badFrame");
      socket.close(4400, "bad frame");
      return;
    }

    if (!bound) {
      if (frame.type !== "hello") {
        sendError(socket, undefined, "HELLO_REQUIRED", "Errors.helloRequired");
        socket.close(4400, "hello required");
        return;
      }

      const room = registry.getRoom(frame.code);
      if (!room) {
        sendError(socket, undefined, "ROOM_NOT_FOUND", "Errors.roomNotFound");
        socket.close(4404, "room not found");
        return;
      }

      const player = findPlayerByTokenHash(room.state, hashToken(frame.token));
      if (!player) {
        sendError(socket, undefined, "INVALID_TOKEN", "Errors.invalidToken");
        socket.close(4401, "invalid token");
        return;
      }

      clearTimeout(handshakeTimer);
      bound = { playerId: player.id, roomCode: room.code };
      room.connect(player.id, socket);
      logger.debug("ws.connected", {
        roomCode: room.code,
        playerId: player.id,
      });
      return;
    }

    const room = registry.getRoom(bound.roomCode);
    if (!room) {
      socket.close(4404, "room not found");
      return;
    }

    if (frame.type === "command") {
      room.handleCommand(bound.playerId, frame.id, frame.command);
      return;
    }

    if (frame.type === "ping") {
      room.handlePing(socket, frame.t);
    }
  });

  socket.on("close", () => {
    clearTimeout(handshakeTimer);

    if (bound) {
      const room = registry.getRoom(bound.roomCode);
      room?.disconnect(bound.playerId, socket);
      logger.debug("ws.disconnected", {
        roomCode: bound.roomCode,
        playerId: bound.playerId,
      });
    }
  });

  socket.on("error", (error) => {
    logger.warn("ws.error", {
      roomCode: bound?.roomCode,
      playerId: bound?.playerId,
      error: error.message,
    });
  });
}

function sendError(
  socket: WebSocket,
  id: string | undefined,
  code: string,
  messageKey: string,
): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      type: "error",
      id,
      code,
      messageKey,
    }),
  );
}
