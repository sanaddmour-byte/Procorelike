import { expect, type Page, test } from "@playwright/test";

const SEED_PASSWORD = "ChangeMe123!";

async function loginAndOpenDashboard(page: Page, email: string): Promise<void> {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);

  const card = page.locator("li", { hasText: "Amman Heights Residential Tower" });
  await card.getByRole("link", { name: "View directory" }).click();
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("owner_admin sees the full rollup including financial sections", async ({ page }) => {
  await loginAndOpenDashboard(page, "sara.haddad@siteops.test");

  await expect(page.getByRole("heading", { name: "RFIs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Punch List" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Budget" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Change Orders" })).toBeVisible();
});

test("client_viewer sees field data but not financial sections", async ({ page }) => {
  await loginAndOpenDashboard(page, "karim.abughazaleh@siteops.test");

  await expect(page.getByRole("heading", { name: "RFIs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Punch List" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Budget" })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Change Orders" })).not.toBeVisible();
});
