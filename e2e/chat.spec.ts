import { test, expect } from "@playwright/test";

test("onboarding chat renders dynamic field", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Conversational onboarding form")).toBeVisible();
  await page.getByPlaceholder("Type a message…").fill("hello");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("What is your full name?").first()).toBeVisible({ timeout: 15000 });
});
