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

/**
 * Three-player custom room with ten-second phases. Ten seconds is the server's
 * minimum for custom durations, so phase auto-advance is exercised quickly
 * without touching production timings.
 */
const CUSTOM_CONFIG = {
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
  phaseDurations: {
    roleReveal: 10_000,
    night: 10_000,
    nightReport: 10_000,
    dayDiscussion: 10_000,
    voting: 10_000,
    voteResult: 10_000,
  },
  whisperBudget: 3,
  tieRule: "no-elimination",
  revealRoleOnVote: true,
} as const;

interface Identity {
  code: string;
  playerId: string;
  token: string;
  name: string;
}

test.describe("live phase hardening", () => {
  test("alerts are auto-read on open and result phases omit ready", async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);

    const host = await createCustomRoom(request, "HostAlpha");
    const players: Identity[] = [host];
    for (const name of ["Bravo", "Charlie"]) {
      players.push(await joinRoom(request, host.code, name));
    }

    const opened: Array<{ context: BrowserContext; page: Page }> = [];

    try {
      for (const player of players) {
        opened.push(await openLobby(browser, player));
      }
      const pages = opened.map((entry) => entry.page);
      const [hostPage, , watchedPage] = pages;

      await Promise.all(
        pages.map(async (page) => {
          for (const player of players) {
            await expect(
              page.getByText(player.name, { exact: true }).first(),
            ).toBeVisible({ timeout: 15_000 });
          }
        }),
      );

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

      // Nobody acts, so the server resolves the night on the 10s timer and
      // enters nightReport (the "Dawn" phase label).
      await expect(hostPage.locator("[data-phase-timer]")).toContainText(
        /dawn/i,
        { timeout: 25_000 },
      );

      // The night report screen has no ready control; the server advances it.
      await expect(
        hostPage.getByRole("button", { name: "Ready", exact: true }),
      ).toHaveCount(0);

      // BottomNav has no data-testid for its badge, so assert the accessible
      // text: an unread badge makes the link read "1 Alerts", and clearing the
      // badge leaves exactly "Alerts".
      const alertsLink = hostPage.locator('a[href="/alerts"]');
      await expect(alertsLink).toHaveCount(1);
      await expect
        .poll(async () => normalizeLabel(await alertsLink.innerText()), {
          timeout: 15_000,
        })
        .toMatch(/^\d+alerts$/i);

      // Opening the alerts page marks everything read; there is no manual
      // "Mark all read" action any more.
      await hostPage.goto("/alerts");
      await expect(
        hostPage.getByRole("heading", { name: "Alerts", level: 1 }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        hostPage.getByRole("button", { name: /mark all read/i }),
      ).toHaveCount(0);

      // AlertItem has no stable test id and does not render timestamps. The
      // page sorts by `at` descending, so the first title is the newest alert;
      // here the only alert generated so far is the dawn death report.
      const alertTitles = hostPage.locator(
        "main div.space-y-2 > div p.font-medium",
      );
      await expect(alertTitles.first()).toHaveText("Death at dawn", {
        timeout: 20_000,
      });
      await expect(
        hostPage.getByText(
          /no one died last night|was killed during the night/i,
        ),
      ).toBeVisible({ timeout: 20_000 });

      // AlertItem receives showUnread={false} on this page, so no unread dot
      // (bg-primary) is rendered inside the content area.
      await expect(hostPage.locator("main span.bg-primary")).toHaveCount(0);

      // The badge is gone once the page has acknowledged the alerts.
      const alertsLinkAfterOpen = hostPage.locator('a[href="/alerts"]');
      await expect
        .poll(
          async () => normalizeLabel(await alertsLinkAfterOpen.innerText()),
          { timeout: 15_000 },
        )
        .toMatch(/^alerts$/i);

      // voteResult is reached after nightReport + day + voting (about 30s).
      // It must not offer a Ready control either. Poll for the phase and check
      // the button in the same sample so a later night phase cannot satisfy it.
      await expect
        .poll(
          async () => {
            const label = await watchedPage
              .locator("[data-phase-timer]")
              .innerText()
              .catch(() => "");
            if (!/vote result/i.test(label)) return "waiting";
            const readyButtons = await watchedPage
              .getByRole("button", { name: "Ready", exact: true })
              .count();
            return readyButtons === 0 ? "ok" : "has-ready";
          },
          {
            timeout: 60_000,
            message: "vote result screen must not show a Ready button",
          },
        )
        .toBe("ok");
    } finally {
      await Promise.all(
        opened.map((entry) => entry.context.close().catch(() => {})),
      );
    }
  });
});

function normalizeLabel(text: string): string {
  return text.replace(/\s+/g, "");
}

async function createCustomRoom(
  request: APIRequestContext,
  name: string,
): Promise<Identity> {
  const response = await request.post(`${BASE_URL}/rt/rooms`, {
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
    },
    data: { name, config: CUSTOM_CONFIG },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as {
    code: string;
    playerId: string;
    token: string;
  };
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

async function openLobby(
  browser: Browser,
  identity: Identity,
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
  await page.goto("/lobby");
  return { context, page };
}
