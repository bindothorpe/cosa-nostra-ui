export interface LiveErrorLike {
  code?: string;
  messageKey?: string;
  params?: Record<string, string | number>;
}

export function hasMessage(messages: unknown, key: string | undefined): boolean {
  if (!key) return false;

  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object" || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }

  return typeof node === "string";
}

/**
 * The realtime/HTTP layers return i18n keys. The live route ships without an
 * `Errors.*` catalog, so turn those keys into a short readable sentence.
 */
export function fallbackErrorText(error: LiveErrorLike): string {
  const raw = error.messageKey?.split(".").pop() ?? error.code ?? "";
  const normalized = raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!normalized) return "Something went wrong. Try again.";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
