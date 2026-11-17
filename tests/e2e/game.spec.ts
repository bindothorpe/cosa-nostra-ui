import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const BASE_URL = (
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080"
).replace(/\/$/, "");
const ORIGIN = new URL(BASE_URL).origin;

interface Identity {
  code: string;
  playerId: string;
  token: string;
  name: string;
}

test.describe("live game screens", () => {
  test("create via API, join three players, start, reveal roles, reach night", async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);

    const host = await createRoom(request, "HostAlpha");
    const players = [host];
    for (const name of ["Bravo", "Charlie"]) {
      players.push(await joinRoom(request, host.code, name));
    }

    const opened: Array<{ context: BrowserContext; page: Page }> = [];

    try {
      for (const player of players) {
        opened.push(await openLobby(browser, player));
      }
      const pages = opened.map((entry) => entry.page);
      const [hostPage] = pages;

      await Promise.all(
        pages.map(async (page) => {
          for (const player of players) {
            await expect(
              page.getByText(player.name, { exact: true }).first(),
            ).toBeVisible({ timeout: 15_000 });
          }
        }),
      );

      // Role peek must not expose the lobby placeholder role.
      await expect(
        hostPage.getByRole("button", { name: /peek at role/i }),
      ).toHaveCount(0);

      // Only the host is offered the start control.
      await expect(
        hostPage.getByRole("button", { name: "Start game" }),
      ).toBeVisible({ timeout: 15_000 });
      for (const page of pages.slice(1)) {
        await expect(
          page.getByRole("button", { name: "Start game" }),
        ).toHaveCount(0);
      }

      // The old mock hint must not leak into any live screen.
      await Promise.all(pages.map((page) => expectNoLegacyHostText(page)));

      // 320px mobile check: reload the host at the smallest supported width
      // and confirm the page does not scroll horizontally.
      await hostPage.setViewportSize({ width: 320, height: 640 });
      await hostPage.reload();
      await expect(
        hostPage.getByText(host.name, { exact: true }).first(),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        hostPage.getByRole("button", { name: "Start game" }),
      ).toBeEnabled({ timeout: 15_000 });
      await expect
        .poll(
          () =>
            hostPage.evaluate(
              () => document.documentElement.scrollWidth - window.innerWidth,
            ),
          { timeout: 10_000, message: "horizontal page scroll at 320px" },
        )
        .toBeLessThanOrEqual(0);

      const start = hostPage.getByRole("button", { name: "Start game" });
      await expect(start).toBeEnabled({ timeout: 15_000 });
      await start.click();

      await Promise.all(
        pages.map((page) => page.waitForURL("**/play", { timeout: 15_000 })),
      );
      await Promise.all(
        pages.map(async (page) => {
          await expect(page.locator("[data-phase-timer]")).toContainText(
            /role reveal/i,
            { timeout: 15_000 },
          );
          await expect(
            page.getByRole("button", { name: "I know my role" }),
          ).toBeVisible({ timeout: 15_000 });
        }),
      );

      await Promise.all(
        pages.map((page) =>
          page.getByRole("button", { name: "I know my role" }).click(),
        ),
      );

      await Promise.all(
        pages.map((page) =>
          expect(page.locator("[data-phase-timer]")).toContainText(
            /night 1/i,
            { timeout: 20_000 },
          ),
        ),
      );

      const noCrash = await Promise.all(
        pages.map(async (page) => {
          const body = await page.locator("body").innerText();
          expect(body).not.toMatch(
            /application error|unhandled runtime error|client-side exception/i,
          );
          await expectNoLegacyHostText(page);
          return true;
        }),
      );
      expect(noCrash.every(Boolean)).toBe(true);

      // Reopen the saved seat from the landing page, then use the rejoin action.
      const index = 1;
      const identity = players[index];
      await opened[index].context.close();
      const reconnected = await openLanding(browser, identity);
      opened.push(reconnected);

      const rejoinButton = reconnected.page.getByTestId("rejoin-game");
      await expect(rejoinButton).toBeVisible({ timeout: 15_000 });
      await expect(reconnected.page.getByTestId("rejoin-meta")).toContainText(
        identity.code,
      );
      await expect(reconnected.page.getByTestId("rejoin-meta")).toContainText(
        /night/i,
      );

      await rejoinButton.click();
      await reconnected.page.waitForURL("**/play", { timeout: 15_000 });
      await expect(
        reconnected.page.locator("[data-phase-timer]"),
      ).toContainText(/night 1/i, { timeout: 15_000 });
      await expect(
        reconnected.page.getByText(identity.name, { exact: true }).first(),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await Promise.all(
        opened.map((entry) => entry.context.close().catch(() => {})),
      );
    }
  });
});

async function createRoom(
  request: APIRequestContext,
  name: string,
): Promise<Identity> {
  const response = await request.post(`${BASE_URL}/rt/rooms`, {
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
    },
    data: { name, config: "default" },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as { code: string; playerId: string; token: string };
  expect(body.code).toMatch(/^[A-Z]{5}$/);
  return { ...body, name };
}

async function joinRoom(
  request: APIRequestContext,
  code: string,
  name: string,
): Promise<Identity> {
  const response = await request.post(`${BASE_URL}/rt/rooms/${code}/join`, {
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
    },
    data: { name },
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = (await response.json()) as {
    code: string;
    playerId: string;
    token: string;
  };
  return { ...body, name };
}

/** Text from the pre-live mock lobby; it must never render in live mode. */
async function expectNoLegacyHostText(page: Page): Promise<void> {
  await expect(
    page.getByText("In the real game the host starts the round."),
  ).toHaveCount(0);
}

async function openLobby(
  browser: Browser,
  identity: Identity,
): Promise<{ context: BrowserContext; page: Page }> {
  return openWithSavedSeat(browser, identity, "/lobby");
}

async function openLanding(
  browser: Browser,
  identity: Identity,
): Promise<{ context: BrowserContext; page: Page }> {
  return openWithSavedSeat(browser, identity, "/");
}

async function openWithSavedSeat(
  browser: Browser,
  identity: Identity,
  path: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  await context.addInitScript(
    (seed) => {
      try {
        window.localStorage.setItem(`cosa.token.${seed.code}`, seed.token);
        window.localStorage.setItem("cosa.lastRoom", seed.code);
        window.localStorage.setItem("cosa.name", seed.name);
      } catch {
        // The app surfaces a missing seat instead of crashing.
      }
    },
    { code: identity.code, token: identity.token, name: identity.name },
  );
  const page = await context.newPage();
  await page.goto(path);
  return { context, page };
}
