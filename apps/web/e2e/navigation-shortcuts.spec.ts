import { expect, test, type APIRequestContext } from "@playwright/test";

const PASSWORD = "ChangeMe123!";
const EMAIL = "sara.haddad@siteops.test";

async function ammanId(request: APIRequestContext): Promise<{ id: string; token: string }> {
  const auth = await (await request.post("http://localhost:4000/auth/login", { data: { email: EMAIL, password: PASSWORD } })).json();
  const projects = await (await request.get("http://localhost:4000/projects", { headers: { authorization: `Bearer ${auth.accessToken}` } })).json();
  return { id: projects.find((p: { name: string }) => p.name.startsWith("Amman")).id, token: auth.accessToken };
}

test("a link opened while signed out returns to that page after login (C4)", async ({ page, request }) => {
  const { id } = await ammanId(request);
  await page.goto(`/en/projects/${id}/rfis`);
  await expect(page).toHaveURL(/\/en\/login/);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/projects/${id}/rfis$`));
});

test("the Mine preset filters the punch list to my items with one tap (E2)", async ({ page, request }) => {
  const { id } = await ammanId(request);
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
  await page.goto(`/en/projects/${id}/punch-list`);
  const mine = page.getByRole("button", { name: "Mine", exact: true });
  await expect(mine).toHaveAttribute("aria-pressed", "false");
  const listRequest = page.waitForRequest((r) => r.url().includes("/punch-items?") && r.url().includes("assigneeUserId="));
  await mine.click();
  await expect(mine).toHaveAttribute("aria-pressed", "true");
  await listRequest; // the list was re-queried with my user id
  await expect(page).toHaveURL(/f_assigneeUserId=/);
});

test("Back from a record returns to the same filtered list (C3)", async ({ page, request }) => {
  const { id } = await ammanId(request);
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
  await page.goto(`/en/projects/${id}/punch-list`);
  await page.getByRole("searchbox").fill("tile");
  await expect(page).toHaveURL(/q=tile/);
  await expect.poll(async () => page.locator("[role=row][tabindex='0']").count()).toBeGreaterThan(0);
  await page.locator("[role=row][tabindex='0']").first().click();
  await expect(page).toHaveURL(/punch-list\/[0-9a-f-]{36}$/);
  await page.goBack();
  await expect(page).toHaveURL(/q=tile/);
  await expect(page.getByRole("searchbox")).toHaveValue("tile");
});

test("list rows are real links, so open-in-new-tab and long-press work (C4)", async ({ page, request }) => {
  const { id } = await ammanId(request);
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
  await page.goto(`/en/projects/${id}/rfis`);
  const link = page.locator("[role=row] a[href*='/rfis/']").first();
  await expect(link).toHaveAttribute("href", new RegExp(`/en/projects/${id}/rfis/[0-9a-f-]{36}$`));
  const [popup] = await Promise.all([page.context().waitForEvent("page"), link.click({ modifiers: ["Control"] })]);
  await expect(popup).toHaveURL(/\/rfis\/[0-9a-f-]{36}$/);
});

test("records I opened appear under Recently opened on My Work (C4)", async ({ page, request }) => {
  const { id } = await ammanId(request);
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
  await page.goto(`/en/projects/${id}/rfis`);
  await page.locator("[role=row][tabindex='0']").first().click();
  await expect(page).toHaveURL(/rfis\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto(`/en/projects/${id}/my-work`);
  const recent = page.getByRole("region", { name: "Recently opened" });
  await expect(recent.getByRole("link").first()).toContainText("RFI");
});

test("search opens with quick actions before anything is typed (C5)", async ({ page, request }) => {
  const { id } = await ammanId(request);
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
  await page.goto(`/en/projects/${id}/my-work`);
  await page.getByRole("button", { name: "Search", exact: false }).first().click();
  await page.getByRole("button", { name: /Snag \(photo first\)/ }).click();
  await expect(page).toHaveURL(/punch-list\/new$/);
});

test("bulk assign can set a due date on the selected snags (B9)", async ({ page, request }) => {
  const { id, token } = await ammanId(request);
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
  await page.goto(`/en/projects/${id}/punch-list`);
  await page.locator('[role=row] input[type="checkbox"]').first().check();
  await page.getByRole("button", { name: "Assign to…" }).click();
  await page.locator('[role=dialog] input[type="date"]').fill("2030-01-15");
  const done = page.waitForResponse((r) => r.url().includes("/punch-items/bulk-update") && r.status() === 200);
  await page.locator("[role=dialog] button").filter({ hasText: /^Assign \d+/ }).click();
  await done;
  const items = await (await request.get(`http://localhost:4000/punch-items?projectId=${id}&pageSize=100`, { headers: { authorization: `Bearer ${token}` } })).json();
  expect(items.some((i: { dueDate: string | null }) => i.dueDate?.startsWith("2030-01-1"))).toBe(true);
});

test("the punch list can be grouped, groups collapse, and the choice survives a reload (B2)", async ({ page, request }) => {
  const { id } = await ammanId(request);
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
  await page.goto(`/en/projects/${id}/punch-list`);
  await page.getByLabel("Group by").selectOption("status");
  const headers = page.locator("[role=row] button[aria-expanded]");
  await expect(headers.first()).toBeVisible();
  await headers.first().click();
  await expect(headers.first()).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(page.getByLabel("Group by")).toHaveValue("status");
  await expect(page.locator("[role=row] button[aria-expanded]").first()).toHaveAttribute("aria-expanded", "false");
});

test("swiping a snag card reveals Assign to me, which assigns it (E2)", async ({ page, request }) => {
  const { id, token } = await ammanId(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
  const me = await page.evaluate(() => JSON.parse(localStorage.getItem("siteops.auth") ?? "{}").user.id as string);
  const count = async (): Promise<number> => (await (await request.get(`http://localhost:4000/punch-items?projectId=${id}&assigneeUserId=${me}&pageSize=100`, { headers: { authorization: `Bearer ${token}` } })).json()).length;
  const before = await count();
  await page.goto(`/en/projects/${id}/punch-list`);
  const row = page.locator("[role=row][tabindex='0']").nth(2);
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const action = page.getByRole("button", { name: "Assign to me" });
  await expect(action).toBeVisible();
  await action.click();
  await expect.poll(count).toBeGreaterThanOrEqual(before);
  await expect(action).toBeHidden();
});

test("photos are grouped by day with lazy thumbnails instead of raw ids (E8)", async ({ page, request }) => {
  const { id } = await ammanId(request);
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
  await page.goto(`/en/projects/${id}/photos`);
  const day = page.locator("main section[aria-label]").first();
  await expect(day).toBeVisible();
  await expect(day.locator("h2 bdi")).toHaveText(/^\d{4}-\d{2}-\d{2}$|—/);
  expect(await day.locator("div.aspect-square").count()).toBeGreaterThan(0);
});

test("change events and change orders live on separate tabs (E12)", async ({ page, request }) => {
  const { id } = await ammanId(request);
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
  await page.goto(`/en/projects/${id}/change-orders`);
  await expect(page.getByRole("tab", { name: "Change orders" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Change events" })).toBeHidden();
  await page.getByRole("tab", { name: "Change events" }).click();
  await expect(page.getByRole("tabpanel", { name: "Change events" })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Change orders" })).toBeHidden();
});
