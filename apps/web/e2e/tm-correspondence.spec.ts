import { expect, type Page, test } from "@playwright/test";

const SEED_PASSWORD = "ChangeMe123!";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/projects$/);
}

test("a T&M ticket is created with entries, computes its total, and moves through draft -> submitted -> approved", async ({ page }) => {
  await login(page, "omar.nassar@siteops.test");

  const card = page.locator("li", { hasText: "Amman Heights Residential Tower" });
  await card.getByRole("link", { name: "View directory" }).click();
  await page.getByRole("link", { name: "T&M Tickets" }).click();
  await expect(page).toHaveURL(/\/tm-tickets$/);

  const description = `E2E T&M ticket ${Date.now()}`;
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("Work date").fill("2026-01-20");
  await page.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: "+ Add labor entry" }).click();
  await page.getByPlaceholder("Worker name").fill("Ahmad Salem");
  await page.getByPlaceholder("Hours").fill("8");
  await page.getByPlaceholder("Rate").fill("10");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByText(description, { exact: false })).toBeVisible();
  await page.getByText(description, { exact: false }).first().click();
  await expect(page).toHaveURL(/\/tm-tickets\/.+/);
  await expect(page.getByText("Total: 80.00")).toBeVisible();

  await page.getByRole("button", { name: "Submitted" }).click();
  await page.getByRole("button", { name: "Approved" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Back to T&M tickets" }).click();
  await expect(page.getByText(description, { exact: false })).toBeVisible();
});

test("correspondence is created and moves through draft -> sent -> acknowledged -> closed", async ({ page }) => {
  await login(page, "omar.nassar@siteops.test");

  const card = page.locator("li", { hasText: "Amman Heights Residential Tower" });
  await card.getByRole("link", { name: "View directory" }).click();
  await page.getByRole("link", { name: "Correspondence" }).click();
  await expect(page).toHaveURL(/\/correspondence$/);

  const subject = `E2E correspondence ${Date.now()}`;
  await page.getByRole("button", { name: "New correspondence" }).click();
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("Body").fill("Please proceed with the scope discussed on site.");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByText(subject, { exact: false })).toBeVisible();
  await page.getByText(subject, { exact: false }).first().click();
  await expect(page).toHaveURL(/\/correspondence\/.+/);
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sent" }).click();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Acknowledged" }).click();
  await expect(page.getByText("Acknowledged", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Closed" }).click();
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
});
