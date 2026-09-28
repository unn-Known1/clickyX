import { test, expect } from "@playwright/test";

// Mocked-panel only: browser E2E cannot reach xcap/enigo/clipboard or a
// second WebviewWindow, so all Jarvis Tauri commands resolve from the
// bindings.ts browser mocks. Real capture/fill is manual-matrix + WebDriver.
test.describe("Jarvis co-pilot (mocked)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.click(".start-chat-btn");
    await expect(page.locator(".chat-messages")).toBeVisible({ timeout: 20000 });
  });

  test("panel opens from chat header and analyzes", async ({ page }) => {
    await page.click(".chat-jarvis-btn");
    await expect(page.locator(".jarvis-panel")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".jarvis-panel-head button")).toContainText("Analyze", {
      timeout: 20000,
    });

    await page.locator(".jarvis-panel-head button").click();
    // Mocked verdict + 3 drafts.
    await expect(page.locator(".jarvis-verdict")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".jarvis-drafts li")).toHaveCount(3, { timeout: 20000 });
    await expect(page.locator(".jarvis-winner")).toBeVisible({ timeout: 20000 });
  });

  test("drafts offer fill and copy", async ({ page }) => {
    await page.click(".chat-jarvis-btn");
    await page.locator(".jarvis-panel-head button").click();
    await expect(page.locator(".jarvis-drafts li")).toHaveCount(3, { timeout: 20000 });
    const first = page.locator(".jarvis-drafts li").first();
    await expect(first.getByRole("button", { name: "Fill" })).toBeVisible();
    await expect(first.getByRole("button", { name: "Copy" })).toBeVisible();
  });

  test("settings jarvis section shows all three cards", async ({ page }) => {
    // Jev Jarvis lives under Settings › Jev Jarvis (settings.sections.jarvis).
    await page.click('[role="tab"]:has-text("Settings")');
    await expect(page.locator(".settings-nav")).toBeVisible({ timeout: 20000 });
    await page.locator(".settings-nav-btn", { hasText: "Jev Jarvis" }).click();
    await expect(page.locator(".settings-section")).toContainText("Decision model", {
      timeout: 20000,
    });
    await expect(page.locator(".settings-section .settings-card")).toHaveCount(3, {
      timeout: 20000,
    });
  });
});
