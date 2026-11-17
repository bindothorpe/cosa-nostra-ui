import { createServer, type Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { attachConnection } from "./connection";
import type { Env } from "./env";
import { canonicalPath, createHttpHandler } from "./http";
import { createLogger, type Logger } from "./logger";
import { RoomRegistry } from "./room-registry";
import { SnapshotStore } from "./snapshot-store";

export interface RunningServer {
  server: Server;
  wss: WebSocketServer;
  registry: RoomRegistry;
  logger: Logger;
  port: number;
  close(): Promise<void>;
}

export interface StartServerOptions {
  env: Env;
  version?: string;
  logger?: Logger;
}

/** Protocol-level ping cadence. Two missed pings terminate a socket. */
export const WS_PING_INTERVAL_MS = 30_000;

type LiveSocket = WebSocket & { isAlive?: boolean };

export async function startServer({
  env,
  version = "0.1.0",
  logger = createLogger(env.logLevel),
}: StartServerOptions): Promise<RunningServer> {
  const store = new SnapshotStore(env.dataDir, logger);
  const registry = new RoomRegistry(env, store, logger, version);

  await registry.init();

  const httpHandler = createHttpHandler({
    api: registry,
    env,
    logger,
    version,
  });

  const server = createServer((request, response) => {
    void httpHandler(request, response);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (canonicalPath(url.pathname) !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const origin = request.headers.origin;
    if (origin && !env.allowedOrigins.includes(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (socket) => {
    const live = socket as LiveSocket;
    live.isAlive = true;
    socket.on("pong", () => {
      live.isAlive = true;
    });
    attachConnection(socket, registry, logger);
  });

  /**
   * Browsers answer protocol pings from their networking layer, so this only
   * proves the TCP connection is alive. It catches phones that vanish without
   * a close frame; page-level activity is tracked separately via lastSeenAt.
   */
  const heartbeat = setInterval(() => {
    logger.debug("ws.ping", { clients: wss.clients.size });
    for (const client of wss.clients) {
      const live = client as LiveSocket;
      if (live.readyState !== WebSocket.OPEN) continue;

      if (live.isAlive === false) {
        logger.warn("ws.ping_timeout", { clients: wss.clients.size });
        live.terminate();
        continue;
      }

      live.isAlive = false;
      live.ping();
    }
  }, WS_PING_INTERVAL_MS);
  heartbeat.unref?.();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(env.port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : env.port;

  logger.info("server.started", {
    port,
    dataDir: env.dataDir,
    allowedOrigins: env.allowedOrigins,
    version,
  });

  let closing: Promise<void> | null = null;

  const close = (): Promise<void> => {
    closing ??= (async () => {
      clearInterval(heartbeat);

      for (const client of wss.clients) {
        client.close(1001, "server shutting down");
      }

      await registry.stop();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      logger.info("server.stopped", { port });
    })();

    return closing;
  };

  return { server, wss, registry, logger, port, close };
}
