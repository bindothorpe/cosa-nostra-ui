import {
  DEFAULT_ROOM_CONFIG,
  addPlayer,
  createRoomState,
  createSeed,
  findPlayerByTokenHash,
  validateConfig,
} from "../../game-core";
import type { RoleId, RoomConfig, RoomState } from "../../game-core/types";
import type {
  CreateRoomRequest,
  HealthInfo,
  RoomAvailability,
  RoomIdentity,
} from "./api-types";
import type { Env } from "./env";
import {
  RealtimeError,
  badRequest,
  conflict,
  notFound,
} from "./errors";
import type { Logger } from "./logger";
import { Room } from "./room";
import type { SnapshotStore } from "./snapshot-store";
import {
  generatePlayerId,
  generateRoomCode,
  generateToken,
  hashToken,
} from "./token";

const ROOM_CODE_ATTEMPTS = 10;

export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly startedAt = Date.now();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly env: Env,
    private readonly store: SnapshotStore,
    private readonly logger: Logger,
    private readonly version: string,
  ) {}

  async init(): Promise<void> {
    const states = await this.store.loadAll();

    for (const state of states) {
      state.players = state.players.map((player) => ({
        ...player,
        connected: false,
      }));

      // Snapshots written before the expanded role set are missing these keys.
      state.config.roleCounts = {
        ...zeroRoleCounts(),
        ...state.config.roleCounts,
      };
      state.executionerTargets ??= {};
      state.vigilanteShots ??= {};

      const room = this.makeRoom(state);
      this.rooms.set(room.code, room);
      room.schedule();
    }

    this.cleanupTimer = setInterval(() => {
      void this.cleanup();
    }, 60_000);
    this.cleanupTimer.unref?.();

    this.logger.info("registry.loaded", { rooms: this.rooms.size });
  }

  async create(input: CreateRoomRequest): Promise<RoomIdentity> {
    const name = normalizeName(input.name);
    const config = this.normalizeConfig(input.config);
    const validation = validateConfig(config, {
      stage: "create",
      playerCount: 1,
    });
    if (validation) {
      throw new RealtimeError(
        400,
        validation.code,
        validation.messageKey,
        validation.params,
      );
    }

    const now = Date.now();
    const token = generateToken();
    const playerId = generatePlayerId();

    for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
      const code = generateRoomCode();
      if (this.rooms.has(code)) continue;

      const state = createRoomState({
        code,
        hostId: playerId,
        hostName: name,
        hostTokenHash: hashToken(token),
        seed: createSeed(),
        now,
        config,
      });

      const room = this.makeRoom(state);
      this.rooms.set(code, room);
      await room.flush();

      this.logger.info("room.created", { roomCode: code });
      return { code, playerId, token };
    }

    throw new RealtimeError(
      503,
      "ROOM_CODE_EXHAUSTED",
      "Errors.roomCodeExhausted",
    );
  }

  /**
   * Read-only join preflight: the room must exist and be in the lobby with a
   * free seat, unless this browser already holds a seat token for it.
   */
  check(rawCode: string, token?: string): RoomAvailability {
    const code = rawCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      throw notFound("ROOM_NOT_FOUND", "Errors.roomNotFound");
    }

    if (token) {
      const player = findPlayerByTokenHash(room.state, hashToken(token));
      if (player) {
        return {
          available: true,
          seat: {
            playerId: player.id,
            name: player.name,
            alive: player.alive,
            phase: room.state.phase,
            round: room.state.round,
          },
        };
      }
    }

    if (room.state.phase !== "lobby") {
      throw conflict("GAME_STARTED", "Errors.gameStarted");
    }

    if (room.state.players.length >= room.state.config.maxPlayers) {
      throw conflict("ROOM_FULL", "Errors.roomFull", {
        max: room.state.config.maxPlayers,
      });
    }

    return { available: true };
  }

  async join(
    rawCode: string,
    rawName: string,
    token?: string,
  ): Promise<RoomIdentity> {
    const code = rawCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      throw notFound("ROOM_NOT_FOUND", "Errors.roomNotFound");
    }

    if (token) {
      const player = findPlayerByTokenHash(room.state, hashToken(token));
      if (player) {
        return { code, playerId: player.id, token };
      }
    }

    if (room.state.phase !== "lobby") {
      throw conflict("GAME_STARTED", "Errors.gameStarted");
    }

    if (room.state.players.length >= room.state.config.maxPlayers) {
      throw conflict("ROOM_FULL", "Errors.roomFull");
    }

    const name = normalizeName(rawName);
    const newToken = generateToken();
    const playerId = generatePlayerId();

    const result = addPlayer(room.state, {
      id: playerId,
      name,
      tokenHash: hashToken(newToken),
      now: Date.now(),
    });

    if (!result.ok) {
      throw conflict(result.error.code, result.error.messageKey, result.error.params);
    }

    room.applyExternalState(result.state, Date.now());
    await room.flush();

    this.logger.info("room.joined", { roomCode: code, playerId });
    return { code, playerId, token: newToken };
  }

  health(): HealthInfo {
    let sockets = 0;
    for (const room of this.rooms.values()) {
      sockets += room.socketCount;
    }

    return {
      ok: true,
      rooms: this.rooms.size,
      sockets,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      version: this.version,
    };
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  async deleteRoom(code: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) return;

    this.rooms.delete(code);
    await room.close();
    await this.store.delete(code);
    this.logger.info("room.deleted", { roomCode: code });
  }

  async flushAll(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    await Promise.all([...this.rooms.values()].map((room) => room.flush()));
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    await Promise.all([...this.rooms.values()].map((room) => room.close()));
    this.rooms.clear();
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      const reason = room.expiryReason(now);
      if (!reason) continue;

      this.logger.info("room.expired", {
        roomCode: room.code,
        reason,
        phase: room.state.phase,
        emptyForMs: room.emptyForMs(now),
        lastSeenAtByPlayer: room.lastSeenByPlayer,
      });
      await this.deleteRoom(room.code);
    }
  }

  private makeRoom(state: RoomState): Room {
    return new Room({
      state,
      store: this.store,
      logger: this.logger,
      snapshotDebounceMs: this.env.snapshotDebounceMs,
      lobbyTtlMs: this.env.roomLobbyTtlMs,
      gameoverTtlMs: this.env.roomGameoverTtlMs,
      emptyTtlMs: this.env.roomEmptyTtlMs,
      onEmpty: (code) => this.deleteRoom(code),
    });
  }

  private normalizeConfig(input: unknown): RoomConfig {
    const base: RoomConfig = {
      ...DEFAULT_ROOM_CONFIG,
    };

    if (input === "default") {
      return {
        ...base,
        rolePreset: "default",
        roleCounts: { ...DEFAULT_ROOM_CONFIG.roleCounts },
      };
    }

    if (!input || typeof input !== "object") {
      throw badRequest("INVALID_CONFIG", "Errors.invalidConfig");
    }

    const custom = input as Partial<RoomConfig>;
    return {
      ...base,
      ...custom,
      rolePreset: "custom",
      minPlayers: custom.minPlayers ?? base.minPlayers,
      maxPlayers: custom.maxPlayers ?? base.maxPlayers,
      roleCounts: { ...zeroRoleCounts(), ...custom.roleCounts },
      phaseDurations: { ...base.phaseDurations, ...custom.phaseDurations },
      whisperBudget: custom.whisperBudget ?? base.whisperBudget,
      tieRule: custom.tieRule ?? base.tieRule,
      revealRoleOnVote: custom.revealRoleOnVote ?? base.revealRoleOnVote,
    };
  }
}

function normalizeName(input: string): string {
  const name = input
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  if (name.length < 1 || name.length > 20) {
    throw badRequest("INVALID_NAME", "Errors.invalidName");
  }

  return name;
}

function zeroRoleCounts(): Record<RoleId, number> {
  return {
    godfather: 0,
    consigliere: 0,
    framer: 0,
    detective: 0,
    doctor: 0,
    bodyguard: 0,
    roleblocker: 0,
    vigilante: 0,
    mayor: 0,
    villager: 0,
    jester: 0,
    executioner: 0,
  };
}
