import {
  expect,
  test,
  type APIRequestContext,
} from "@playwright/test";

const BASE_URL = (
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080"
).replace(/\/$/, "");
const ORIGIN = new URL(BASE_URL).origin;

const JSON_HEADERS = {
  "content-type": "application/json",
  origin: ORIGIN,
};

const FULL_CONFIG = {
  rolePreset: "custom",
  minPlayers: 3,
  maxPlayers: 3,
  roleCounts: {
    godfather: 1,
    framer: 0,
    detective: 1,
    doctor: 1,
    jester: 0,
    villager: 0,
  },
} as const;

interface Identity {
  code: string;
  playerId: string;
  token: string;
}

/**
 * Room creation is limited to 5 per IP per hour, and the whole e2e suite
 * shares one stack. Create the open and full rooms once and reuse them.
 */
let openRoom: Identity | null = null;
let fullRoom: Identity | null = null;

test.describe.configure({ mode: "serial" });

test.describe("join availability", () => {
  test("landing JOIN checks the room before navigating", async ({
    page,
    request,
  }) => {
    openRoom = await createRoom(request, "HostOpen");
    fullRoom = await createRoom(request, "HostFull", FULL_CONFIG);
    await joinRoom(request, fullRoom.code, "Bravo");
    await joinRoom(request, fullRoom.code, "Charlie");

    await page.goto("/");
    const input = page.locator("#room-code");
    const joinButton = page.getByRole("button", {
      name: "Join",
      exact: true,
    });

    await input.fill("ZZZZZ");
    await joinButton.click();
    await expect(page.locator("#room-code-error")).toHaveText(
      "That room no longer exists.",
    );
    await expect(page).toHaveURL(`${BASE_URL}/`);

    await input.fill(fullRoom.code);
    await joinButton.click();
    await expect(page.locator("#room-code-error")).toHaveText(
      "This room is full.",
    );
    await expect(page).toHaveURL(`${BASE_URL}/`);

    await input.fill(openRoom.code);
    await joinButton.click();
    await expect(page).toHaveURL(`${BASE_URL}/join?code=${openRoom.code}`);
    await expect(
      page.getByRole("heading", { name: "Join the table" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("/join sends unavailable links back to the landing page", async ({
    page,
  }) => {
    test.skip(fullRoom === null, "requires the rooms from the first test");
    const room = fullRoom!;

    await page.goto("/join?code=ZZZZZ");
    await expect(page.locator("#room-code-error")).toHaveText(
      "That room no longer exists.",
    );
    await expect(page).toHaveURL(`${BASE_URL}/`);
    await expect(page.locator("#room-code")).toHaveValue("");

    await page.goto("/join?code=AB");
    await expect(page.locator("#room-code-error")).toHaveText(
      "Room codes are exactly 5 letters.",
    );
    await expect(page).toHaveURL(`${BASE_URL}/`);

    await page.goto("/join");
    await expect(page.locator("#room-code-error")).toHaveText(
      "Enter a room code.",
    );
    await expect(page).toHaveURL(`${BASE_URL}/`);

    await page.goto(`/join?code=${room.code}`);
    await expect(page.locator("#room-code-error")).toHaveText(
      "This room is full.",
    );
    await expect(page).toHaveURL(`${BASE_URL}/`);
  });

  test("a saved seat reopens a full room", async ({ browser }) => {
    test.skip(fullRoom === null, "requires the rooms from the first test");
    const room = fullRoom!;

    const context = await browser.newContext({ baseURL: BASE_URL });
    try {
      await context.addInitScript(
        (seat: { code: string; token: string }) => {
          try {
            window.localStorage.setItem(
              `cosa.token.${seat.code}`,
              seat.token,
            );
          } catch {
            // Storage may be unavailable; the test fails visibly if so.
          }
        },
        { code: room.code, token: room.token },
      );

      const page = await context.newPage();
      await page.goto(`/join?code=${room.code}`);
      await expect(
        page.getByRole("heading", { name: "Join the table" }),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });
});

async function createRoom(
  request: APIRequestContext,
  name: string,
  config: "default" | Record<string, unknown> = "default",
): Promise<Identity> {
  const response = await request.post(`${BASE_URL}/rt/rooms`, {
    headers: JSON_HEADERS,
    data: { name, config },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as Identity;
}

async function joinRoom(
  request: APIRequestContext,
  code: string,
  name: string,
): Promise<Identity> {
  const response = await request.post(
    `${BASE_URL}/rt/rooms/${code}/join`,
    {
      headers: JSON_HEADERS,
      data: { name },
    },
  );
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Identity;
}
