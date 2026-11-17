import { startServer } from "./app";
import { loadEnv } from "./env";
import { createLogger } from "./logger";

const VERSION = process.env.APP_VERSION ?? "0.1.0";

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.logLevel);
  const running = await startServer({ env, version: VERSION, logger });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("server.shutdown", { signal });
    await running.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("process.unhandled_rejection", {
      error: reason instanceof Error ? reason.stack : String(reason),
    });
  });

  process.on("uncaughtException", (error) => {
    logger.error("process.uncaught_exception", { error: error.stack });
    process.exit(1);
  });
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      event: "server.failed_to_start",
      error: error instanceof Error ? error.stack : String(error),
    }),
  );
  process.exit(1);
});
