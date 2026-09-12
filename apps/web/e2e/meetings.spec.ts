import { expect, type Page, test } from "@playwright/test";

const SEED_PASSWORD = "ChangeMe123!";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
}

function localDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test("logs a meeting, adds an action item, and converts it to a punch item", async ({ page }) => {
  await login(page, "sara.haddad@siteops.test");

  const card = page.locator("li", { hasText: "Amman Heights Residential Tower" });
  await card.getByRole("link", { name: "View directory" }).click();
  await page.getByRole("link", { name: "Meetings" }).click();
  await expect(page).toHaveURL(/\/meetings$/);

  const title = `E2E Weekly Coordination ${Date.now()}`;
  await page.getByRole("button", { name: "New meeting" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Date").fill(localDatetimeValue(new Date()));
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText(title)).toBeVisible();
  await page.getByText(title).click();
  await expect(page).toHaveURL(/\/meetings\/.+/);

  const itemDescription = `E2E follow up ${Date.now()}`;
  await page.getByPlaceholder("Description").fill(itemDescription);
  await page.getByRole("button", { name: "Add action item" }).click();
  await expect(page.getByText(itemDescription)).toBeVisible();
  await expect(page.getByText("Open", { exact: true })).toBeVisible();

  const itemRow = page.locator("li", { hasText: itemDescription });
  await itemRow.getByRole("button", { name: "Convert to punch item" }).click();
  await expect(itemRow.getByText("Converted to punch item")).toBeVisible();
});
