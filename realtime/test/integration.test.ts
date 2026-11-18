import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { PlayerView } from "../../game-core/types";
import {
  connectSocket,
  createRoom,
  createTestServer,
  joinRoom,
  waitFor,
  type TestServer,
  type TestSocket,
} from "./helpers";

function latestView(socket: TestSocket): PlayerView | undefined {
  for (let index = socket.frames.length - 1; index >= 0; index -= 1) {
    const frame = socket.frames[index];
    if (frame.type === "sync") return frame.view;
  }
  return undefined;
}

async function waitForView(
  socket: TestSocket,
  predicate: (view: PlayerView) => boolean,
  timeoutMs = 5_000,
): Promise<PlayerView> {
  await waitFor(() => {
    const view = latestView(socket);
    return !!view && predicate(view);
  }, timeoutMs);

  const view = latestView(socket);
  if (!view) throw new Error("no view");
  return view;
}

function command(socket: TestSocket, id: string, payload: unknown): void {
  socket.send({ type: "command", id, command: payload });
}

const THREE_PLAYER_CONFIG = {
  rolePreset: "custom",
  minPlayers: 3,
  maxPlayers: 3,
  roleCounts: {
    godfather: 1,
    consigliere: 0,
    framer: 0,
    detective: 1,
    doctor: 1,
    bodyguard: 0,
    roleblocker: 0,
    vigilante: 0,
    mayor: 0,
    villager: 0,
    jester: 0,
    executioner: 0,
  },
};

function checkRoom(
  test: TestServer,
  code: string,
  token?: string,
): Promise<Response> {
  return fetch(`${test.baseUrl}/rt/rooms/${code}/check`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({ token }),
  });
}

describe("realtime server", () => {
  let test: TestServer;

  beforeEach(async () => {
    test = await createTestServer();
  });

  afterEach(async () => {
    await test.cleanup();
  });

  it("creates a room, rejects duplicate names, and reports health", async () => {
    const host = await createRoom(test, "Alessia");
    expect(host.code).toMatch(/^[A-Z0-9]{5}$/);

    await expect(joinRoom(test, host.code, "alessia")).rejects.toThrow();

    const response = await fetch(`${test.baseUrl}/rt/health`);
    const health = (await response.json()) as {
      ok: boolean;
      rooms: number;
      sockets: number;
    };

    expect(health.ok).toBe(true);
    expect(health.rooms).toBe(1);
    expect(health.sockets).toBe(0);
  });

  it("reclaims a seat with the same token", async () => {
    const host = await createRoom(test, "Alessia");
    const again = await joinRoom(test, host.code, "Different", host.token);

    expect(again.playerId).toBe(host.playerId);
    expect(again.token).toBe(host.token);
  });

  it("reports open rooms and rejects unknown room codes", async () => {
    const host = await createRoom(test, "Alessia");

    const open = await checkRoom(test, host.code);
    expect(open.status).toBe(200);
    expect(await open.json()).toEqual({ available: true });

    const missing = await checkRoom(test, "ZZZZZ");
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as {
      error: string;
      messageKey: string;
    };
    expect(body.error).toBe("ROOM_NOT_FOUND");
    expect(body.messageKey).toBe("Errors.roomNotFound");
  });

  it("reports full rooms but lets a saved seat through", async () => {
    const host = await createRoom(test, "Alessia", THREE_PLAYER_CONFIG);
    await joinRoom(test, host.code, "Bruno");
    await joinRoom(test, host.code, "Carla");

    const full = await checkRoom(test, host.code);
    expect(full.status).toBe(409);
    const body = (await full.json()) as {
      error: string;
      messageKey: string;
    };
    expect(body.error).toBe("ROOM_FULL");
    expect(body.messageKey).toBe("Errors.roomFull");

    const saved = await checkRoom(test, host.code, host.token);
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as {
      seat?: { playerId: string; name: string; phase: string; round: number };
    };
    expect(savedBody.seat).toMatchObject({
      playerId: host.playerId,
      name: "Alessia",
      phase: "lobby",
      round: 1,
    });
  });

  it("reports started rooms unless the caller holds a seat", async () => {
    const identities = [await createRoom(test, "P0", THREE_PLAYER_CONFIG)];
    for (let index = 1; index < 3; index += 1) {
      identities.push(
        await joinRoom(test, identities[0].code, `P${index}`),
      );
    }

    const sockets: TestSocket[] = [];
    try {
      for (const identity of identities) {
        sockets.push(
          await connectSocket(test, identity.code, identity.token),
        );
      }

      await waitForView(sockets[0], (view) => view.phase === "lobby");
      command(sockets[0], "start-1", { type: "startGame" });
      await waitForView(sockets[0], (view) => view.phase === "roleReveal");

      const started = await checkRoom(test, identities[0].code);
      expect(started.status).toBe(409);
      const body = (await started.json()) as {
        error: string;
        messageKey: string;
      };
      expect(body.error).toBe("GAME_STARTED");
      expect(body.messageKey).toBe("Errors.gameStarted");

      const saved = await checkRoom(
        test,
        identities[0].code,
        identities[0].token,
      );
      expect(saved.status).toBe(200);
      const savedBody = (await saved.json()) as {
        seat?: { playerId: string; phase: string };
      };
      expect(savedBody.seat).toMatchObject({
        playerId: identities[0].playerId,
        phase: "roleReveal",
      });
    } finally {
      await Promise.all(sockets.map((socket) => socket.close()));
    }
  });

  it("accepts both /rt-prefixed and prefix-stripped proxy paths", async () => {
    const health = await fetch(`${test.baseUrl}/health`);
    expect(health.status).toBe(200);

    const created = await fetch(`${test.baseUrl}/rooms`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ name: "ProxyHost", config: "default" }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { code: string };
    expect(body.code).toMatch(/^[A-Z]{5}$/);
  });

  it("runs role reveal, privacy projection, night actions, and night report", async () => {
    const identities = [await createRoom(test, "P0")];
    for (let index = 1; index < 8; index += 1) {
      identities.push(await joinRoom(test, identities[0].code, `P${index}`));
    }

    const sockets: TestSocket[] = [];
    for (const identity of identities) {
      sockets.push(
        await connectSocket(test, identity.code, identity.token),
      );
    }

    const hostView = await waitForView(sockets[0], (view) => view.phase === "lobby");
    expect(hostView.players).toHaveLength(8);
    expect(hostView.isHost).toBe(true);
    expect(hostView.canStart).toBe(true);

    command(sockets[0], "start-1", { type: "startGame" });

    for (const socket of sockets) {
      await waitForView(socket, (view) => view.phase === "roleReveal");
    }

    const views = sockets.map((socket) => latestView(socket)!);
    const roles = new Map(views.map((view) => [view.you.id, view.yourRole]));

    for (const view of views) {
      const viewerIsMafia = view.yourFaction === "mafia";

      for (const summary of view.players) {
        if (summary.id === view.you.id) {
          expect(summary.roleId).toBe(view.yourRole);
          continue;
        }

        if (summary.roleId !== null) {
          expect(viewerIsMafia).toBe(true);
          const summaryRole = roles.get(summary.id);
          expect(
            summaryRole === "godfather" ||
              summaryRole === "consigliere" ||
              summaryRole === "framer",
          ).toBe(true);
        }
      }

      expect(view.hostConfig).toBeUndefined();
    }

    for (const socket of sockets) {
      command(socket, `ready-${socket.frames.length}`, { type: "setReady" });
    }

    for (const socket of sockets) {
      await waitForView(socket, (view) => view.phase === "night");
    }

    for (const socket of sockets) {
      const view = latestView(socket)!;
      const target = view.players.find(
        (player) => player.alive && player.id !== view.you.id,
      );
      expect(target).toBeDefined();

      const commandId = `night-${view.you.id}`;
      switch (view.yourRole) {
        case "godfather":
          command(socket, commandId, {
            type: "submitNightAction",
            kind: "kill",
            targetId: target!.id,
          });
          break;
        case "consigliere":
          command(socket, commandId, {
            type: "submitNightAction",
            kind: "investigate",
            targetId: target!.id,
          });
          break;
        case "framer":
          command(socket, commandId, {
            type: "submitNightAction",
            kind: "frame",
            targetId: target!.id,
          });
          break;
        case "detective":
          command(socket, commandId, {
            type: "submitNightAction",
            kind: "investigate",
            targetId: target!.id,
          });
          break;
        case "doctor":
          command(socket, commandId, {
            type: "submitNightAction",
            kind: "protect",
            targetId: target!.id,
          });
          break;
        case "bodyguard":
          command(socket, commandId, {
            type: "submitNightAction",
            kind: "guard",
            targetId: target!.id,
          });
          break;
        case "roleblocker":
          command(socket, commandId, {
            type: "submitNightAction",
            kind: "roleblock",
            targetId: target!.id,
          });
          break;
        case "vigilante":
          command(socket, commandId, {
            type: "submitNightAction",
            kind: "shoot",
            targetId: target!.id,
          });
          break;
        case "mayor":
        case "villager":
        case "jester":
        case "executioner":
          command(socket, commandId, { type: "setReady" });
          break;
      }
    }

    for (const socket of sockets) {
      await waitForView(socket, (view) => view.phase === "nightReport");
    }

    const reportView = latestView(sockets[0])!;
    expect(reportView.nightReport).not.toBeNull();
    expect(reportView.nightReport!.deaths.length).toBeLessThanOrEqual(1);
  });
});
