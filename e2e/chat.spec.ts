import { test, expect } from "@playwright/test";

test.describe("Chat tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows empty state when no messages", async ({ page }) => {
    await expect(page.locator(".chat-messages")).toBeVisible();
  });

  test("input field is focusable", async ({ page }) => {
    const input = page.locator(".chat-input, textarea[placeholder*='Ask']");
    await input.focus();
    await expect(input).toBeFocused();
  });
});
