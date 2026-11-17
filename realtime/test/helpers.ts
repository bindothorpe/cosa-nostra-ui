import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import type { ServerFrame } from "../../game-core/types";
import { startServer, type RunningServer } from "../src/app";
import { loadEnv } from "../src/env";
import type { Logger } from "../src/logger";

export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface TestServer {
  running: RunningServer;
  baseUrl: string;
  wsUrl: string;
  dataDir: string;
  cleanup(): Promise<void>;
}

export async function createTestServer(
  existingDataDir?: string,
): Promise<TestServer> {
  const ownsDataDir = !existingDataDir;
  const dataDir =
    existingDataDir ?? (await mkdtemp(path.join(tmpdir(), "cosa-test-")));
  const env = {
    ...loadEnv({
      ...process.env,
      PORT: "0",
      DATA_DIR: dataDir,
      ALLOWED_ORIGINS: "http://localhost:3000",
      LOG_LEVEL: "error",
    }),
    port: 0,
  };

  const running = await startServer({
    env,
    version: "test",
    logger: silentLogger,
  });

  return {
    running,
    dataDir,
    baseUrl: `http://127.0.0.1:${running.port}`,
    wsUrl: `ws://127.0.0.1:${running.port}/rt/ws`,
    async cleanup() {
      await running.close();
      if (ownsDataDir) {
        await rm(dataDir, { recursive: true, force: true });
      }
    },
  };
}

export async function createRoom(
  test: TestServer,
  name: string,
  config: "default" | Record<string, unknown> = "default",
): Promise<{ code: string; playerId: string; token: string }> {
  const response = await fetch(`${test.baseUrl}/rt/rooms`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({ name, config }),
  });

  if (!response.ok) {
    throw new Error(`createRoom failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as {
    code: string;
    playerId: string;
    token: string;
  };
}

export async function joinRoom(
  test: TestServer,
  code: string,
  name: string,
  token?: string,
): Promise<{ code: string; playerId: string; token: string }> {
  const response = await fetch(`${test.baseUrl}/rt/rooms/${code}/join`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({ name, token }),
  });

  if (!response.ok) {
    throw new Error(`joinRoom failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as {
    code: string;
    playerId: string;
    token: string;
  };
}

export interface TestSocket {
  ws: WebSocket;
  frames: ServerFrame[];
  nextFrame(predicate?: (frame: ServerFrame) => boolean): Promise<ServerFrame>;
  send(payload: unknown): void;
  close(): Promise<void>;
}

export function connectSocket(
  test: TestServer,
  code: string,
  token: string,
): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(test.wsUrl);
    const frames: ServerFrame[] = [];
    const waiters: Array<{
      predicate: (frame: ServerFrame) => boolean;
      resolve: (frame: ServerFrame) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }> = [];

    const timeout = setTimeout(() => {
      reject(new Error("socket connect timeout"));
      ws.close();
    }, 5_000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "hello", code, token }));
    });

    ws.on("message", (data) => {
      const frame = JSON.parse(data.toString()) as ServerFrame;
      frames.push(frame);

      for (let index = waiters.length - 1; index >= 0; index -= 1) {
        const waiter = waiters[index];
        if (!waiter.predicate(frame)) continue;
        clearTimeout(waiter.timer);
        waiters.splice(index, 1);
        waiter.resolve(frame);
      }

      if (frame.type === "sync") {
        clearTimeout(timeout);
        resolve(socket);
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    ws.on("close", () => {
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("socket closed"));
      }
    });

    const socket: TestSocket = {
      ws,
      frames,
      nextFrame(predicate = () => true) {
        const existing = frames.find(predicate);
        if (existing) return Promise.resolve(existing);

        return new Promise<ServerFrame>((resolveFrame, rejectFrame) => {
          const timer = setTimeout(() => {
            rejectFrame(new Error("frame timeout"));
          }, 5_000);
          waiters.push({
            predicate,
            resolve: resolveFrame,
            reject: rejectFrame,
            timer,
          });
        });
      },
      send(payload) {
        ws.send(JSON.stringify(payload));
      },
      close() {
        return new Promise<void>((resolveClose) => {
          if (ws.readyState === WebSocket.CLOSED) {
            resolveClose();
            return;
          }
          ws.once("close", () => resolveClose());
          ws.close();
        });
      },
    };
  });
}

export function waitFor(
  predicate: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error("waitFor timeout"));
      }
    }, 10);
  });
}
