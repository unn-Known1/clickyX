import { test, expect } from "@playwright/test";

test.describe("App shell", () => {
  test("loads and shows tab bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[role="tab"]')).toHaveCount(3);
  });

  test("can switch to Agents tab", async ({ page }) => {
    await page.goto("/");
    await page.click('[role="tab"][aria-controls="tabpanel-agents"]');
    await expect(page.locator("#tabpanel-agents")).toBeVisible();
  });

  test("can open command palette with Ctrl+K", async ({ page }) => {
    await page.goto("/");
    // Wait for the app shell to hydrate (splash + lazy tabs) before sending keys.
    await expect(page.locator('[role="tab"]')).toHaveCount(3);
    await page.keyboard.press("Control+k");
    await expect(page.locator(".palette-box")).toBeVisible();
  });
});
