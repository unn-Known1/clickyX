import { test, expect } from "@playwright/test";

test.describe("Settings tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.click('[role="tab"]:has-text("Settings")');
  });

  test("shows settings sections", async ({ page }) => {
    await expect(page.locator(".settings-content, .settings-nav")).toBeVisible();
  });
});
