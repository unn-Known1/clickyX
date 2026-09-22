import { test, expect } from "@playwright/test";

test.describe("Chat tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows empty state when no messages", async ({ page }) => {
    // Chat mounts behind the "Start a conversation" CTA on Home.
    await page.click(".start-chat-btn");
    await expect(page.locator(".chat-messages")).toBeVisible();
    await expect(page.locator(".chat-empty")).toBeVisible();
  });

  test("input field is focusable", async ({ page }) => {
    await page.click(".start-chat-btn");
    const input = page.locator(".chat-input");
    await input.focus();
    await expect(input).toBeFocused();
  });
});
