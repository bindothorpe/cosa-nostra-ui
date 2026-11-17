export class RealtimeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messageKey: string,
    readonly params?: Record<string, string | number>,
  ) {
    super(code);
    this.name = "RealtimeError";
  }
}

export function badRequest(
  code: string,
  messageKey: string,
  params?: Record<string, string | number>,
): RealtimeError {
  return new RealtimeError(400, code, messageKey, params);
}

export function notFound(
  code: string,
  messageKey: string,
  params?: Record<string, string | number>,
): RealtimeError {
  return new RealtimeError(404, code, messageKey, params);
}

export function conflict(
  code: string,
  messageKey: string,
  params?: Record<string, string | number>,
): RealtimeError {
  return new RealtimeError(409, code, messageKey, params);
}

export function forbidden(
  code: string,
  messageKey: string,
  params?: Record<string, string | number>,
): RealtimeError {
  return new RealtimeError(403, code, messageKey, params);
}

export function tooManyRequests(
  code: string,
  messageKey: string,
  params?: Record<string, string | number>,
): RealtimeError {
  return new RealtimeError(429, code, messageKey, params);
}
