import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { RoomState } from "../../game-core/types";
import type { Logger } from "./logger";

const SNAPSHOT_SCHEMA_VERSION = 1;

interface SnapshotFile {
  schemaVersion: number;
  savedAt: number;
  state: RoomState;
}

export class SnapshotStore {
  private readonly roomsDir: string;

  constructor(
    dataDir: string,
    private readonly logger: Logger,
  ) {
    this.roomsDir = path.join(dataDir, "rooms");
  }

  async init(): Promise<void> {
    await mkdir(this.roomsDir, { recursive: true });
  }

  async loadAll(): Promise<RoomState[]> {
    await this.init();

    let entries: string[];
    try {
      entries = await readdir(this.roomsDir);
    } catch (error) {
      this.logger.error("snapshot.readdir_failed", { error: String(error) });
      return [];
    }

    const states: RoomState[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;

      const file = path.join(this.roomsDir, entry);
      try {
        const raw = await readFile(file, "utf8");
        const parsed = JSON.parse(raw) as SnapshotFile;

        if (parsed.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
          this.logger.warn("snapshot.schema_mismatch", {
            file,
            schemaVersion: parsed.schemaVersion,
          });
          continue;
        }

        if (!parsed.state || parsed.state.code !== entry.replace(/\.json$/, "")) {
          this.logger.warn("snapshot.invalid_state", { file });
          continue;
        }

        states.push({ ...parsed.state, updatedAt: parsed.state.updatedAt });
      } catch (error) {
        this.logger.warn("snapshot.corrupt", { file, error: String(error) });
      }
    }

    return states;
  }

  async save(state: RoomState): Promise<void> {
    await this.init();

    const file = this.fileFor(state.code);
    const tmp = `${file}.${randomUUID()}.tmp`;
    const payload: SnapshotFile = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      savedAt: Date.now(),
      state,
    };

    const handle = await open(tmp, "w", 0o600);
    try {
      await handle.writeFile(JSON.stringify(payload), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    await rename(tmp, file);
  }

  async delete(code: string): Promise<void> {
    try {
      await unlink(this.fileFor(code));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  private fileFor(code: string): string {
    if (!/^[A-Z0-9]{5}$/.test(code)) {
      throw new Error(`Invalid room code for snapshot: ${code}`);
    }
    return path.join(this.roomsDir, `${code}.json`);
  }
}
