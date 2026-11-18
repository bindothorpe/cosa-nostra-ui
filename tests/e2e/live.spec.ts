import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

const BASE_URL = (
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080"
).replace(/\/$/, "");
const ORIGIN = new URL(BASE_URL).origin;

const PLAYER_COUNT = 8;
const EXTRA_NAMES = [
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
] as const;

const PHASE_ROLE_REVEAL = "roleReveal";
const PHASE_NIGHT = "night";
// Fallbacks for pages that expose the phase label as translated text only.
const ROLE_REVEAL_TEXT = /role|reveal|rol|onthul/i;
const NIGHT_TEXT = /night|nacht/i;

const JOIN_ERROR_TEXT =
  /error|fout|game started|already (started|begun)|in progress|begonnen|gestart|in uitvoering|bezig/i;
const APP_CRASH_TEXT =
  /application error|unhandled runtime error|client-side exception/i;

type RoleId =
  | "godfather"
  | "consigliere"
  | "framer"
  | "detective"
  | "doctor"
  | "bodyguard"
  | "roleblocker"
  | "vigilante"
  | "mayor"
  | "villager"
  | "jester"
  | "executioner";

interface Identity {
  code: string;
  playerId: string;
  token: string;
}

interface PlayerIdentity extends Identity {
  name: string;
}

interface ApiErrorBody {
  error: string;
  messageKey: string;
}

interface PhaseReading {
  /** Raw `data-phase` value when the live page exposes it. */
  attr: string | null;
  text: string;
}

const ROLE_PATTERNS: Array<{ id: RoleId; pattern: RegExp }> = [
  { id: "godfather", pattern: /godfather|peetvader|doopvader/i },
  { id: "consigliere", pattern: /consigliere|consiglieri|raadsman|adviseur/i },
  { id: "framer", pattern: /framer|fraudeur|vervalser/i },
  { id: "detective", pattern: /detective|rechercheur|inspecteur/i },
  { id: "doctor", pattern: /\bdoctor\b|\bdokter\b|\barts\b|\bheelmeester\b/i },
  { id: "bodyguard", pattern: /bodyguard|lijfwacht|beschermer/i },
  { id: "roleblocker", pattern: /role\s*blocker|rolblokkeerder|blokkeerder/i },
  { id: "vigilante", pattern: /vigilante|burgerwacht|wrekende/i },
  { id: "mayor", pattern: /\bmayor\b|burgemeester/i },
  { id: "villager", pattern: /villager|dorpsbewoner|dorpeling|burger/i },
  { id: "jester", pattern: /jester|dwaas|grappenmaker|\bnar\b/i },
  { id: "executioner", pattern: /executioner|beul|scherprechter/i },
];

const JSON_HEADERS = {
  "content-type": "application/json",
  origin: ORIGIN,
};

/** Room code from the first test; the second test reuses its started game. */
let startedGameCode: string | null = null;

test.describe("live multiplayer", () => {
  test.describe.configure({ mode: "serial" });

  test("eight players start a game, reach night, and reconnect", async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);

    const host = await createRoom(request, "Host");
    const code = host.code;
    const players: PlayerIdentity[] = [{ ...host, name: "Host" }];

    for (const name of EXTRA_NAMES) {
      const joined = await joinRoom(request, code, name);
      players.push({ ...joined, name });
    }
    expect(players).toHaveLength(PLAYER_COUNT);

    const opened: Array<{ context: BrowserContext; page: Page }> = [];

    try {
      for (const player of players) {
        opened.push(await openRoomPage(browser, player));
      }
      const pages = opened.map((entry) => entry.page);
      const [hostPage] = pages;

      // Every page syncs the full lobby.
      await Promise.all(
        pages.map((page) =>
          expect(
            page.locator('[data-testid="live-player"]'),
          ).toHaveCount(PLAYER_COUNT, { timeout: 15_000 }),
        ),
      );

      for (const page of pages) {
        await expect(
          page.locator('[data-testid="live-room-code"]'),
        ).toContainText(new RegExp(code, "i"));
      }

      // The host may start an eight-player lobby; nobody else sees a start action.
      await expect(
        hostPage.locator('[data-testid="live-start"]:visible').first(),
      ).toBeEnabled({ timeout: 15_000 });

      await hostPage
        .locator('[data-testid="live-start"]:visible')
        .first()
        .click();

      await Promise.all(
        pages.map((page) =>
          waitForPhase(page, PHASE_ROLE_REVEAL, ROLE_REVEAL_TEXT),
        ),
      );

      startedGameCode = code;

      await Promise.all(pages.map((page) => readyUp(page)));
      await Promise.all(
        pages.map((page) => waitForPhase(page, PHASE_NIGHT, NIGHT_TEXT)),
      );

      // Privacy sanity: each page renders exactly its own role and no foreign roles.
      const ownRoles = new Map<Page, RoleId>();
      for (const page of pages) {
        const { raw, role } = await readOwnRole(page);
        expect(
          role,
          `live-you-role is not one of the twelve roles: "${raw}"`,
        ).not.toBeNull();
        if (!role) throw new Error(`unknown role text: "${raw}"`);
        ownRoles.set(page, role);
      }
      for (const page of pages) {
        await assertNoForeignRoles(page, ownRoles.get(page)!);
      }

      // Reconnect a non-host player with the same stored identity.
      const reconnectIndex = 1;
      const reconnectIdentity = players[reconnectIndex];
      const oldPage = opened[reconnectIndex].page;
      const phaseBefore = await readPhase(oldPage);
      const roleBefore = ownRoles.get(oldPage)!;

      await assertMarkedAsYou(
        await playerCardFor(oldPage, reconnectIdentity.name),
        reconnectIdentity,
      );

      await opened[reconnectIndex].context.close();

      const reconnected = await openRoomPage(browser, reconnectIdentity);
      opened.push(reconnected);
      const newPage = reconnected.page;

      await waitForSamePhase(newPage, phaseBefore);
      expect(await readOwnRole(newPage)).toMatchObject({ role: roleBefore });
      await assertMarkedAsYou(
        await playerCardFor(newPage, reconnectIdentity.name),
        reconnectIdentity,
      );
    } finally {
      await Promise.all(
        opened.map((entry) => entry.context.close().catch(() => {})),
      );
    }
  });

  test("rejects fresh players joining a started game", async ({
    browser,
    request,
  }) => {
    test.setTimeout(60_000);

    const code = startedGameCode;
    test.skip(code === null, "requires the started game from the previous test");
    if (!code) return;

    // The HTTP contract is the source of truth: joining after start is a 409.
    const attempt = await request.post(
      `${BASE_URL}/rt/rooms/${code}/join`,
      {
        headers: JSON_HEADERS,
        data: { name: "Latecomer" },
      },
    );
    expect(attempt.status()).toBe(409);
    const body = (await attempt.json()) as ApiErrorBody;
    expect(body.error).toBe("GAME_STARTED");

    // The UI must surface the error instead of crashing.
    const contexts: BrowserContext[] = [];
    try {
      for (const name of ["LatecomerA", "LatecomerB"]) {
        const context = await browser.newContext({ baseURL: BASE_URL });
        contexts.push(context);
        const page = await context.newPage();

        await page.goto("/live");
        await expect(page.locator("#live-name")).toBeVisible({
          timeout: 15_000,
        });
        await page.locator("#live-name").fill(name);
        await page.locator("#live-code").fill(code);
        await page.locator('[data-testid="live-join"]').click();

        await expectJoinError(page);
      }
    } finally {
      await Promise.all(
        contexts.map((context) => context.close().catch(() => {})),
      );
    }
  });
});

async function createRoom(
  request: APIRequestContext,
  name: string,
): Promise<Identity> {
  const response = await request.post(`${BASE_URL}/rt/rooms`, {
    headers: JSON_HEADERS,
    data: { name, config: "default" },
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

async function openRoomPage(
  browser: Browser,
  identity: PlayerIdentity,
): Promise<{ context: BrowserContext; page: Page }> {
  // browser.newContext() does not inherit `use` options (only the built-in
  // `context` fixture does), so baseURL has to be passed explicitly.
  const context = await browser.newContext({ baseURL: BASE_URL });
  await context.addInitScript(
    (seed) => {
      try {
        window.localStorage.setItem(`cosa.token.${seed.code}`, seed.token);
        window.localStorage.setItem("cosa.lastRoom", seed.code);
        window.localStorage.setItem("cosa.name", seed.name);
      } catch {
        // Storage can be unavailable; the room page will surface the failure.
      }
    },
    { code: identity.code, token: identity.token, name: identity.name },
  );
  const page = await context.newPage();
  await page.goto(`/live/${identity.code}`);
  return { context, page };
}

function phaseElement(page: Page): Locator {
  return page.locator('[data-testid="live-phase"]').first();
}

async function readPhase(page: Page): Promise<PhaseReading> {
  try {
    const element = phaseElement(page);
    if ((await element.count()) === 0) return { attr: null, text: "" };

    const attr = await element
      .getAttribute("data-phase", { timeout: 1_000 })
      .catch(() => null);
    const text = await element
      .innerText({ timeout: 1_000 })
      .catch(() => "");

    return { attr: attr?.trim() || null, text: text.trim() };
  } catch {
    return { attr: null, text: "" };
  }
}

function phaseMatches(
  reading: PhaseReading,
  expected: string,
  fallbackText: RegExp,
): boolean {
  if (reading.attr) {
    return reading.attr.toLowerCase() === expected.toLowerCase();
  }
  return fallbackText.test(reading.text);
}

async function waitForPhase(
  page: Page,
  expected: string,
  fallbackText: RegExp,
  timeout = 20_000,
): Promise<void> {
  await expect
    .poll(async () => phaseMatches(await readPhase(page), expected, fallbackText), {
      timeout,
    })
    .toBe(true);
}

async function waitForSamePhase(
  page: Page,
  expected: PhaseReading,
  timeout = 15_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const current = await readPhase(page);
        if (expected.attr) {
          return current.attr?.toLowerCase() === expected.attr.toLowerCase();
        }
        return current.text.length > 0 && current.text === expected.text;
      },
      { timeout },
    )
    .toBe(true);
}

async function readyUp(page: Page): Promise<void> {
  const ready = page.locator('[data-testid="live-ready"]:visible').first();
  try {
    await expect(ready).toBeVisible({ timeout: 15_000 });
    // Skip when the player is already ready (the button is disabled).
    if (await ready.isEnabled()) {
      await ready.click({ timeout: 5_000 });
    }
  } catch {
    // The phase may already have advanced; the night wait is authoritative.
  }
}

async function readOwnRole(
  page: Page,
): Promise<{ raw: string; role: RoleId | null }> {
  const element = page.locator('[data-testid="live-you-role"]').first();
  await expect(element).toBeVisible({ timeout: 15_000 });

  const dataRole = await element.getAttribute("data-role");
  const raw = dataRole?.trim() || (await element.innerText()).trim();
  return { raw, role: parseRole(raw) };
}

function parseRole(text: string): RoleId | null {
  for (const { id, pattern } of ROLE_PATTERNS) {
    if (pattern.test(text)) return id;
  }
  return null;
}

async function assertNoForeignRoles(
  page: Page,
  ownRole: RoleId,
): Promise<void> {
  const roleNodes = page.locator('[data-testid^="live-role-"]');
  const count = await roleNodes.count();

  if (count > 0) {
    const mafiaViewer =
      ownRole === "godfather" ||
      ownRole === "consigliere" ||
      ownRole === "framer";
    for (const text of await roleNodes.allInnerTexts()) {
      if (!text.trim()) continue;
      const role = parseRole(text);
      if (!role) continue;

      if (mafiaViewer) {
        // Mafia may legitimately see their own team's roles.
        expect(
          role === "godfather" ||
            role === "consigliere" ||
            role === "framer",
          `mafia page exposes a non-mafia role: "${text}"`,
        ).toBe(true);
      } else {
        expect(
          role,
          `page exposes another player's role: "${text}"`,
        ).toBe(ownRole);
      }
    }
    return;
  }

  // No per-player role test ids: live-you-role must be the only role element.
  const roleElements = page.locator('[data-testid*="role"]');
  await expect(roleElements).toHaveCount(1);
  await expect(roleElements.first()).toHaveAttribute(
    "data-testid",
    "live-you-role",
  );
}

async function playerCardFor(
  page: Page,
  playerName: string,
): Promise<Locator> {
  const cards = page.locator('[data-testid="live-player"]');
  // Wait for the full roster so a reconnecting page has finished its first sync.
  await expect(cards).toHaveCount(PLAYER_COUNT, { timeout: 15_000 });

  const card = cards.filter({ hasText: playerName });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  return card.first();
}

async function assertMarkedAsYou(
  card: Locator,
  identity: PlayerIdentity,
): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          if ((await card.getAttribute("data-you")) === "true") return true;
          if ((await card.getAttribute("aria-current")) === "true") return true;
          if ((await card.locator('[data-testid="live-you"]').count()) > 0) {
            return true;
          }
          const text = (await card.innerText()).toLowerCase();
          return /\b(you|jij|jouw)\b/.test(text);
        } catch {
          return false;
        }
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  // When the card exposes the raw player id, it must be the same seat after reconnect.
  const playerId = await card.getAttribute("data-player-id");
  if (playerId) expect(playerId).toBe(identity.playerId);
}

async function expectJoinError(page: Page): Promise<void> {
  const messages = page.locator(
    '[data-testid="live-error"], [data-testid="live-status"], [role="alert"], [data-sonner-toast]',
  );

  await expect
    .poll(
      async () => {
        const body = await page.locator("body").innerText().catch(() => "");
        if (APP_CRASH_TEXT.test(body)) return false;

        if ((await messages.count()) > 0) {
          const texts = await messages.allInnerTexts();
          if (texts.some((text) => JOIN_ERROR_TEXT.test(text))) return true;
        }

        return JOIN_ERROR_TEXT.test(body);
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const body = await page.locator("body").innerText();
  expect(
    APP_CRASH_TEXT.test(body),
    "the live page crashed instead of showing an error",
  ).toBe(false);
}
