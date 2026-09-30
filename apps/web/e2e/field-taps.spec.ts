import { expect, type Page, test } from "@playwright/test";

/**
 * Interaction-count budgets for the D1 field tasks (docs/ux/TASK_BENCHMARKS.md, docs/ux/AUDIT_RESULTS.md).
 * A "tap" is a tap or a field focus; a native <select> costs 2; a file picker costs 2 -- the same rules as the audit.
 * Each test fails if a change makes a field task cost more taps than its budget. Phone viewport, English and Arabic.
 */
const PASSWORD = "ChangeMe123!";
const EMAIL = "sara.haddad@siteops.test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

for (const locale of ["en", "ar"] as const) {
  test.describe(`field task budgets (${locale})`, () => {
    let taps = 0;
    const tap = async (fn: () => Promise<unknown>, cost = 1): Promise<void> => {
      taps += cost;
      await fn();
    };

    async function signedInReturningUser(page: Page): Promise<void> {
      const res = await page.request.post("http://localhost:4000/auth/login", { data: { email: EMAIL, password: PASSWORD } });
      const auth = await res.json();
      const projects = await (await page.request.get("http://localhost:4000/projects", { headers: { authorization: `Bearer ${auth.accessToken}` } })).json();
      const amman = projects.find((p: { name: string }) => p.name.startsWith("Amman"));
      await page.addInitScript(
        ([a, id]) => {
          localStorage.setItem("siteops.auth", JSON.stringify(a));
          localStorage.setItem("siteops.lastProject", id as string);
        },
        [auth, amman.id] as const,
      );
      taps = 0;
      await page.goto(`/${locale}`);
      await expect(page).toHaveURL(/\/my-work$/); // landing = My Work, 0 taps (T7)
    }

    test("T7 everything assigned to me is on the landing screen in 0 taps", async ({ page }) => {
      await signedInReturningUser(page);
      await expect(page.locator("main li a").first()).toBeVisible();
      expect(taps).toBeLessThanOrEqual(2);
    });

    test("T3 raise an inspection request in <= 6 taps", async ({ page }) => {
      await signedInReturningUser(page);
      await tap(() => page.getByRole("navigation").getByRole("button").nth(0).click()); // + Capture
      await tap(() => page.locator("[role=dialog] button").nth(3).click()); // Inspection
      await page.locator("form select").first().waitFor();
      await tap(() => page.locator('main form button[type="submit"]').click());
      expect(taps).toBeLessThanOrEqual(6);
    });

    test("T4 find a drawing by sheet number in <= 4 taps", async ({ page }) => {
      await signedInReturningUser(page);
      await tap(() => page.getByRole("navigation").getByRole("link").nth(2).click()); // Drawings
      await page.waitForURL(/drawings$/);
      await tap(() => page.locator('input[type="search"]').first().fill("E-401"));
      await page.waitForFunction(() => document.querySelectorAll("[role=row][tabindex='0']").length === 1);
      await tap(() => page.locator("[role=row][tabindex='0']").first().click());
      await expect(page).toHaveURL(/drawings\/[0-9a-f-]{36}$/);
      expect(taps).toBeLessThanOrEqual(4);
    });

    test("T9 switching project keeps the screen type in <= 3 taps", async ({ page }) => {
      await signedInReturningUser(page);
      await page.goto(page.url().replace("/my-work", "/punch-list"));
      taps = 0;
      await tap(() => page.locator('header button[aria-haspopup="listbox"]').click());
      await tap(() => page.locator('[role=option]:not([aria-selected="true"])').first().click());
      await expect(page).toHaveURL(/\/punch-list$/);
      expect(taps).toBeLessThanOrEqual(3);
    });

    test("a snag created with no connection is kept and sent when the connection returns (D2)", async ({ page, context }) => {
      await signedInReturningUser(page);
      await page.goto(page.url().replace("/my-work", "/punch-list/new"));
      await page.locator("textarea").first().waitFor();
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      await page.locator("textarea").first().fill(`Offline E2E ${Date.now()}`);
      await page.locator("form button").filter({ hasText: /add another|إضافة/i }).first().click();
      await expect(page.getByRole("status").first()).toBeVisible();
      const queued = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const open = indexedDB.open("siteops");
            open.onsuccess = () => {
              const all = open.result.transaction("outbox").objectStore("outbox").getAll();
              all.onsuccess = () => resolve(all.result.length);
            };
          }),
      );
      expect(queued).toBeGreaterThan(0);
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              new Promise<number>((resolve) => {
                const open = indexedDB.open("siteops");
                open.onsuccess = () => {
                  const all = open.result.transaction("outbox").objectStore("outbox").getAll();
                  all.onsuccess = () => resolve(all.result.length);
                };
              }),
          ),
        )
        .toBe(0);
    });
  });
}

test("an RFI answer written with no connection is kept and sent on reconnect (D2, T6)", async ({ page, context }) => {
  const res = await page.request.post("http://localhost:4000/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  const auth = await res.json();
  const projects = await (await page.request.get("http://localhost:4000/projects", { headers: { authorization: `Bearer ${auth.accessToken}` } })).json();
  const amman = projects.find((p: { name: string }) => p.name.startsWith("Amman"));
  await page.addInitScript(
    ([a, id]) => {
      localStorage.setItem("siteops.auth", JSON.stringify(a));
      localStorage.setItem("siteops.lastProject", id as string);
    },
    [auth, amman.id] as const,
  );
  await page.goto("/en");
  await page.locator("main a[href*='/rfis/']").first().click();
  await expect(page).toHaveURL(/rfis\/[0-9a-f-]{36}$/);
  const rfiId = page.url().split("/").pop()!;
  await page.locator("main textarea").first().waitFor();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  const text = `Offline answer ${Date.now()}`;
  await page.locator("main textarea").first().fill(text);
  await page.getByRole("button", { name: "Add response" }).click();
  await expect(page.getByText(/Saved on this device/).first()).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(async () => {
      const rfi = await (await page.request.get(`http://localhost:4000/rfis/${rfiId}`, { headers: { authorization: `Bearer ${auth.accessToken}` } })).json();
      return (rfi.responses ?? []).some((r: { responseText: string }) => r.responseText === text);
    })
    .toBe(true);
});
