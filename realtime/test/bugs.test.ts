import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createTestServer, type TestServer } from "./helpers";

const ORIGIN = "http://localhost:3000";

function postBug(test: TestServer, message: string, origin = ORIGIN) {
  return fetch(`${test.baseUrl}/rt/bugs`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ message }),
  });
}

async function listBugs(test: TestServer) {
  const response = await fetch(`${test.baseUrl}/rt/bugs`);
  expect(response.status).toBe(200);
  return (await response.json()) as {
    bugs: { id: string; message: string; createdAt: string }[];
  };
}

describe("bug reports", () => {
  let test: TestServer | null = null;

  afterEach(async () => {
    if (test) await test.cleanup();
    test = null;
  });

  it("starts empty and stores trimmed reports newest first", async () => {
    test = await createTestServer();

    expect((await listBugs(test)).bugs).toEqual([]);

    const first = await postBug(test, "  First bug  ");
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as {
      id: string;
      message: string;
      createdAt: string;
    };
    expect(firstBody.id).toBeTruthy();
    expect(firstBody.message).toBe("First bug");
    expect(Number.isNaN(Date.parse(firstBody.createdAt))).toBe(false);

    const second = await postBug(test, "Second bug");
    expect(second.status).toBe(201);

    const { bugs } = await listBugs(test);
    expect(bugs.map((bug) => bug.message)).toEqual(["Second bug", "First bug"]);
  });

  it("rejects empty and oversized messages", async () => {
    test = await createTestServer();

    expect((await postBug(test, "   ")).status).toBe(400);
    expect((await postBug(test, "x".repeat(2001))).status).toBe(400);

    expect((await listBugs(test)).bugs).toEqual([]);
  });

  it("rejects posts from a disallowed origin", async () => {
    test = await createTestServer();

    const response = await postBug(test, "Sneaky", "https://evil.example");
    expect(response.status).toBe(403);
    expect((await listBugs(test)).bugs).toEqual([]);
  });

  it("rate limits submissions per IP", async () => {
    test = await createTestServer();

    for (let index = 0; index < 5; index += 1) {
      expect((await postBug(test, `Report ${index}`)).status).toBe(201);
    }

    expect((await postBug(test, "One too many")).status).toBe(429);
    expect((await listBugs(test)).bugs).toHaveLength(5);
  });

  it("keeps reports across a restart", async () => {
    test = await createTestServer();
    expect((await postBug(test, "Survives redeploy")).status).toBe(201);

    const dataDir = test.dataDir;
    await test.running.close();
    test = await createTestServer(dataDir);

    const { bugs } = await listBugs(test);
    expect(bugs).toHaveLength(1);
    expect(bugs[0].message).toBe("Survives redeploy");

    await test.cleanup();
    test = null;
    await rm(dataDir, { recursive: true, force: true });
  });
});
