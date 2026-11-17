const TOKEN_PREFIX = "cosa.token.";
const READ_PREFIX = "cosa.read.";
const NAME_KEY = "cosa.name";
const LAST_ROOM_KEY = "cosa.lastRoom";

export interface ReadState {
  threads: Record<string, number>;
  alertsReadAt: number;
}

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Storage can be unavailable in private windows; the app still works in-memory.
  }
}

export function getToken(code: string): string | null {
  return read(`${TOKEN_PREFIX}${code}`);
}

export function setToken(code: string, token: string): void {
  write(`${TOKEN_PREFIX}${code}`, token);
}

export function clearToken(code: string): void {
  write(`${TOKEN_PREFIX}${code}`, null);
}

export function getName(): string {
  return read(NAME_KEY) ?? "";
}

export function setName(name: string): void {
  write(NAME_KEY, name);
}

export function getLastRoom(): string | null {
  return read(LAST_ROOM_KEY);
}

export function setLastRoom(code: string): void {
  write(LAST_ROOM_KEY, code);
}

export function clearLastRoom(): void {
  write(LAST_ROOM_KEY, null);
}

export function getReadState(code: string): ReadState {
  const raw = read(`${READ_PREFIX}${code}`);
  if (!raw) return { threads: {}, alertsReadAt: 0 };

  try {
    const parsed = JSON.parse(raw) as Partial<ReadState>;
    return {
      threads: parsed.threads ?? {},
      alertsReadAt: parsed.alertsReadAt ?? 0,
    };
  } catch {
    return { threads: {}, alertsReadAt: 0 };
  }
}

export function setReadState(code: string, state: ReadState): void {
  write(`${READ_PREFIX}${code}`, JSON.stringify(state));
}
