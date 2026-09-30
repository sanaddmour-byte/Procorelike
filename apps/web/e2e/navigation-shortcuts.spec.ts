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
