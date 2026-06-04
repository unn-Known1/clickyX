import { test, expect } from "@playwright/test";

test.describe("App shell", () => {
  test("loads and shows tab bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[role="tab"]')).toHaveCount(4);
  });

  test("can switch to Agents tab", async ({ page }) => {
    await page.goto("/");
    await page.click('[role="tab"][aria-controls="agents-panel"]');
    await expect(page.locator("#agents-panel")).toBeVisible();
  });

  test("can open command palette with Ctrl+K", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await expect(page.locator(".command-palette")).toBeVisible();
  });
});
