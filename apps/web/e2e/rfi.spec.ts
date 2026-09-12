import { expect, type Page, test } from "@playwright/test";

const SEED_PASSWORD = "ChangeMe123!";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
}

test("full RFI lifecycle: create, submit, respond, answer, close", async ({ page }) => {
  await login(page, "omar.nassar@siteops.test");

  const card = page.locator("li", { hasText: "Amman Heights Residential Tower" });
  await card.getByRole("link", { name: "View directory" }).click();
  await page.getByRole("link", { name: "RFIs" }).click();
  await expect(page).toHaveURL(/\/rfis$/);

  const subject = `E2E RFI ${Date.now()}`;
  await page.getByRole("button", { name: "New RFI" }).click();
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("Question").fill("Does the slab thickness change on level 5?");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText(subject)).toBeVisible();
  await page.getByText(subject).click();
  await expect(page).toHaveURL(/\/rfis\/.+/);
  await expect(page.getByText(/^Draft ·/)).toBeVisible();

  await page.getByRole("button", { name: "Submit RFI" }).click();
  await expect(page.getByText(/^Open ·/)).toBeVisible();

  await page.getByLabel("Response").fill("No, level 5 keeps the 200mm slab per the original spec.");
  await page.getByRole("button", { name: "Add response" }).click();
  await expect(page.getByText("No, level 5 keeps the 200mm slab per the original spec.")).toBeVisible();

  await page.getByRole("button", { name: "Answered", exact: true }).click();
  await expect(page.getByText(/^Answered ·/)).toBeVisible();

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText(/^Closed ·/)).toBeVisible();

  await page.getByRole("link", { name: "Back to RFIs" }).click();
  await expect(page.getByText(subject)).toBeVisible();
});
