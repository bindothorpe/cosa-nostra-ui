import { afterEach, describe, expect, it } from "vitest";
import {
  connectSocket,
  createRoom,
  createTestServer,
  joinRoom,
  type TestServer,
} from "./helpers";

describe("persistence and reconnect", () => {
  let test: TestServer | null = null;

  afterEach(async () => {
    if (test) await test.cleanup();
    test = null;
  });

  it("reclaims a seat after the socket closes", async () => {
    test = await createTestServer();
    const host = await createRoom(test, "Alessia");
    const player = await joinRoom(test, host.code, "Marco");

    const first = await connectSocket(test, host.code, player.token);
    const firstView = first.frames.find((frame) => frame.type === "sync");
    expect(firstView?.type).toBe("sync");
    await first.close();

    const second = await connectSocket(test, host.code, player.token);
    const secondView = second.frames.find((frame) => frame.type === "sync");
    expect(secondView?.type).toBe("sync");
    if (secondView?.type !== "sync") throw new Error("missing sync");
    expect(secondView.view.you.id).toBe(player.playerId);
    await second.close();
  });

  it("restores rooms and seats after a restart", async () => {
    test = await createTestServer();
    const host = await createRoom(test, "Alessia");
    await joinRoom(test, host.code, "Marco");

    const socket = await connectSocket(test, host.code, host.token);
    await socket.close();

    const dataDir = test.dataDir;
    await test.running.close();
    test = await createTestServer(dataDir);

    const restored = await connectSocket(test, host.code, host.token);
    const sync = restored.frames.find((frame) => frame.type === "sync");
    if (sync?.type !== "sync") throw new Error("missing sync");

    expect(sync.view.code).toBe(host.code);
    expect(sync.view.players).toHaveLength(2);
    expect(sync.view.phase).toBe("lobby");

    const health = (await (
      await fetch(`${test.baseUrl}/rt/health`)
    ).json()) as { rooms: number };
    expect(health.rooms).toBe(1);

    await restored.close();
  });
});
