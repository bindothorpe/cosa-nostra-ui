import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import type { BugReport } from "./api-types";
import type { Logger } from "./logger";

const BUGS_SCHEMA_VERSION = 1;

interface BugsFile {
  schemaVersion: number;
  bugs: BugReport[];
}

/**
 * Append-only store for user-submitted bug reports. Writes are serialized and
 * atomic (temp file + rename) so concurrent submissions can't lose entries.
 */
export class BugStore {
  private readonly file: string;
  private bugs: BugReport[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dataDir: string,
    private readonly logger: Logger,
  ) {
    this.file = path.join(dataDir, "bugs.json");
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });

    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw) as BugsFile;

      if (
        parsed.schemaVersion !== BUGS_SCHEMA_VERSION ||
        !Array.isArray(parsed.bugs)
      ) {
        this.logger.warn("bugs.schema_mismatch", {
          file: this.file,
          schemaVersion: parsed.schemaVersion,
        });
        return;
      }

      this.bugs = parsed.bugs.filter(isBugReport);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      this.logger.warn("bugs.corrupt", {
        file: this.file,
        error: String(error),
      });
    }
  }

  /** Newest first. */
  list(): BugReport[] {
    return this.bugs.map((bug) => ({ ...bug }));
  }

  async add(message: string): Promise<BugReport> {
    const report: BugReport = {
      id: randomUUID(),
      message,
      createdAt: new Date().toISOString(),
    };

    this.bugs = [report, ...this.bugs];
    await this.persist();
    return { ...report };
  }

  private persist(): Promise<void> {
    // Keep the chain alive after a failed write so later submissions retry.
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(() => this.writeFile());
    return this.writeQueue;
  }

  private async writeFile(): Promise<void> {
    const payload: BugsFile = {
      schemaVersion: BUGS_SCHEMA_VERSION,
      bugs: this.bugs,
    };
    const tmp = `${this.file}.${randomUUID()}.tmp`;

    const handle = await open(tmp, "w", 0o600);
    try {
      await handle.writeFile(JSON.stringify(payload), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    await rename(tmp, this.file);
  }
}

function isBugReport(value: unknown): value is BugReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.id === "string" &&
    typeof report.message === "string" &&
    typeof report.createdAt === "string"
  );
}
