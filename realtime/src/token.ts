import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";

const ROOM_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateRoomCode(length = 5): string {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function generatePlayerId(): string {
  return `p_${randomUUID().replaceAll("-", "")}`;
}
