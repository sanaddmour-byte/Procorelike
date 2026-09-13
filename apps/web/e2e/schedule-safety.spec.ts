import { expect, type Page, test } from "@playwright/test";

const SEED_PASSWORD = "ChangeMe123!";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
}

test("schedule task moves through not_started -> in_progress -> complete", async ({ page }) => {
  await login(page, "omar.nassar@siteops.test");

  const card = page.locator("li", { hasText: "Amman Heights Residential Tower" });
  await card.getByRole("link", { name: "View directory" }).click();
  await page.getByRole("link", { name: "Schedule" }).click();
  await expect(page).toHaveURL(/\/schedule$/);

  const name = `E2E Schedule Task ${Date.now()}`;
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Task name").fill(name);
  await page.getByLabel("Start date").fill("2026-01-05");
  await page.getByLabel("End date").fill("2026-01-12");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText(name)).toBeVisible();
  await page.getByText(name).click();
  await expect(page).toHaveURL(/\/schedule\/.+/);
  await expect(page.getByText(/^Not started ·/)).toBeVisible();

  await page.getByRole("button", { name: "In progress" }).click();
  await expect(page.getByText(/^In progress ·/)).toBeVisible();

  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByText(/^Complete ·/)).toBeVisible();

  await page.getByRole("link", { name: "Back to schedule" }).click();
  await expect(page.getByText(name)).toBeVisible();
});

test("safety incident is logged, investigated, and closed with a corrective action", async ({ page }) => {
  await login(page, "fadi.salameh@siteops.test");

  const card = page.locator("li", { hasText: "Amman Heights Residential Tower" });
  await card.getByRole("link", { name: "View directory" }).click();
  await page.getByRole("link", { name: "Safety" }).click();
  await expect(page).toHaveURL(/\/safety$/);

  const description = `E2E safety incident ${Date.now()}`;
  await page.getByRole("button", { name: "New incident" }).click();
  await page.getByLabel("Occurred at").fill("2026-01-10T09:00");
  await page.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByText(description, { exact: false })).toBeVisible();
  await page.getByText(description, { exact: false }).first().click();
  await expect(page).toHaveURL(/\/safety\/.+/);
  await expect(page.getByText("Open", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Investigating" }).click();
  await expect(page.getByText("Investigating", { exact: true })).toBeVisible();

  await page.getByPlaceholder("What was done to prevent this from happening again?").fill("Installed non-slip matting.");
  await page.getByRole("button", { name: "Close with corrective action" }).click();
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  await expect(page.getByText("Installed non-slip matting.")).toBeVisible();
});

test("safety observation is logged and resolved", async ({ page }) => {
  await login(page, "fadi.salameh@siteops.test");

  const card = page.locator("li", { hasText: "Amman Heights Residential Tower" });
  await card.getByRole("link", { name: "View directory" }).click();
  await page.getByRole("link", { name: "Safety" }).click();
  await page.getByRole("link", { name: "Observations" }).click();
  await expect(page).toHaveURL(/\/safety\/observations$/);

  const description = `E2E safety observation ${Date.now()}`;
  await page.getByRole("button", { name: "New observation" }).click();
  await page.getByLabel("Observed at").fill("2026-01-10T09:00");
  await page.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  const row = page.locator("li", { hasText: description });
  await expect(row).toBeVisible();
  await expect(row.getByText("Open", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Resolve" }).click();
  await expect(row.getByText("Resolved", { exact: true })).toBeVisible();
});
