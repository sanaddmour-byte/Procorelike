import { expect, type Page, test } from "@playwright/test";

const SEED_PASSWORD = "ChangeMe123!";
// Amman Heights Residential Tower, from packages/db/src/seed.ts.
const PROJECT_ID_PATH = "projects";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
}

async function openAmmanHeights(page: Page): Promise<void> {
  const card = page.locator("li", { hasText: "Amman Heights Residential Tower" });
  await card.getByRole("link", { name: "View directory" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/${PROJECT_ID_PATH}/.+/directory`));
  await page.getByRole("link", { name: "Punch List" }).click();
  await expect(page).toHaveURL(/\/punch-list$/);
}

test("creates a punch item and moves it through its status lifecycle", async ({ page }) => {
  await login(page, "omar.nassar@siteops.test");
  await openAmmanHeights(page);

  const description = `E2E punch item ${Date.now()}`;
  await page.getByRole("link", { name: "New punch item" }).click();
  await page.getByLabel("Description").fill(description);
  await page.getByLabel("Priority").selectOption("high");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/punch-list\/.+/);
  await expect(page.getByText(description)).toBeVisible();
  await expect(page.getByText("Open", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Move to: Ready for review" }).click();
  await expect(page.getByText("Ready for review", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Move to: Approved" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Back to punch list" }).click();
  await expect(page.getByText(description)).toBeVisible();
});
