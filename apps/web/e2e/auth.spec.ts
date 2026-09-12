import { expect, test } from "@playwright/test";

const SEED_PASSWORD = "ChangeMe123!";

test("logs in and sees scoped projects", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill("sara.haddad@siteops.test");
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/en\/projects$/);
  await expect(page.getByText("Amman Heights Residential Tower")).toBeVisible();
  await expect(page.getByText("Zarqa Wastewater Pipeline Expansion")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/en\/?$/);
});

test("rejects an invalid password", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill("sara.haddad@siteops.test");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/en\/login$/);
});
