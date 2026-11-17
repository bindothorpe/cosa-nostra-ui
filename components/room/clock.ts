/**
 * Server clock offset, in milliseconds. Add this to Date.now() to approximate
 * the server's clock. Updated on every sync frame.
 */
export type ClockOffset = number;

/**
 * Anything beyond a few minutes of skew is a broken clock, not a usable offset.
 * Clamping keeps phase timers from jumping by hours when a device or the server
 * has the wrong time.
 */
export const MAX_CLOCK_OFFSET_MS = 5 * 60_000;

export function offsetFrom(serverNow: number, now = Date.now()): ClockOffset {
  const offset = serverNow - now;
  if (!Number.isFinite(offset)) return 0;
  return Math.max(-MAX_CLOCK_OFFSET_MS, Math.min(MAX_CLOCK_OFFSET_MS, offset));
}

export function serverNow(offset: ClockOffset, now = Date.now()): number {
  return now + offset;
}

export function remainingMs(
  phaseEndsAt: number | null,
  offset: ClockOffset,
  now = Date.now(),
): number | null {
  if (phaseEndsAt === null) return null;
  return Math.max(0, phaseEndsAt - serverNow(offset, now));
}

export function formatRemaining(ms: number | null): string {
  if (ms === null) return "";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
