import { test, expect } from "@playwright/test";

test.describe("Settings tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.click('[role="tab"]:has-text("Settings")');
  });

  test("shows settings sections", async ({ page }) => {
    // SettingsTab is a heavy lazy chunk — allow cold dev-server compile time.
    await expect(page.locator(".settings-nav")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".settings-content-wrapper")).toBeVisible({ timeout: 20000 });
  });
});
