import { expect, test } from "@playwright/test";

const BASE_URL = (
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080"
).replace(/\/$/, "");

const MISSING_CODE = "ZZZZZ";

/**
 * A stale seat for a deleted room must not leave the player on a dead screen.
 * Both room-scoped entry points bounce back to the landing page.
 */
test.describe("deleted room redirect", () => {
  test("live room route redirects home", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    try {
      await seedStaleSeat(context, MISSING_CODE);

      const page = await context.newPage();
      await page.goto(`/live/${MISSING_CODE}`);

      await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 15_000 });
    } finally {
      await context.close();
    }
  });

  test("game route redirects home", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    try {
      await seedStaleSeat(context, MISSING_CODE);

      const page = await context.newPage();
      await page.goto("/play");

      await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 15_000 });
    } finally {
      await context.close();
    }
  });
});

async function seedStaleSeat(
  context: import("@playwright/test").BrowserContext,
  code: string,
): Promise<void> {
  await context.addInitScript((roomCode: string) => {
    try {
      window.localStorage.setItem(`cosa.token.${roomCode}`, "stale-token");
      window.localStorage.setItem("cosa.lastRoom", roomCode);
    } catch {
      // Storage unavailable: the page redirects for a different reason and
      // the assertion still fails visibly.
    }
  }, code);
}
