/**
 * F-002: Visual regression tests using Playwright's built-in screenshot comparison.
 *
 * First run: npx playwright test e2e/visual.spec.ts --update-snapshots
 *   → creates baseline snapshots in e2e/visual.spec.ts-snapshots/
 *
 * Subsequent runs: npx playwright test e2e/visual.spec.ts
 *   → compares against baselines; fails if pixel diff exceeds threshold
 *
 * CI: baselines should be committed to the repo so CI can compare against them.
 */

import { test, expect } from "@playwright/test";

// Allow up to 0.2% pixel difference (anti-aliasing, font rendering differences)
const THRESHOLD = 0.002;

test.describe("Visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the app to fully render (past splash screen)
    await page.waitForSelector(".tab-bar", { timeout: 10_000 });
  });

  test("home tab matches snapshot", async ({ page }) => {
    // Ensure we're on the home tab
    await page.click('[role="tab"]:has-text("Home")');
    await page.waitForTimeout(200); // settle animations
    await expect(page).toHaveScreenshot("home-tab.png", {
      maxDiffPixelRatio: THRESHOLD,
      animations: "disabled",
    });
  });

  test("agents tab matches snapshot", async ({ page }) => {
    await page.click('[role="tab"]:has-text("Agents")');
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot("agents-tab.png", {
      maxDiffPixelRatio: THRESHOLD,
      animations: "disabled",
    });
  });

  test("connections tab matches snapshot", async ({ page }) => {
    await page.click('[role="tab"]:has-text("Connections")');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("connections-tab.png", {
      maxDiffPixelRatio: THRESHOLD,
      animations: "disabled",
    });
  });

  test("settings tab matches snapshot", async ({ page }) => {
    await page.click('[role="tab"]:has-text("Settings")');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("settings-tab.png", {
      maxDiffPixelRatio: THRESHOLD,
      animations: "disabled",
    });
  });

  test("command palette matches snapshot", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.waitForSelector(".command-palette", { timeout: 3_000 });
    await expect(page.locator(".command-palette")).toHaveScreenshot("command-palette.png", {
      maxDiffPixelRatio: THRESHOLD,
      animations: "disabled",
    });
  });

  test("status bar matches snapshot", async ({ page }) => {
    const statusBar = page.locator(".status-bar, [class*='status-bar']").first();
    if (await statusBar.isVisible()) {
      await expect(statusBar).toHaveScreenshot("status-bar.png", {
        maxDiffPixelRatio: THRESHOLD,
        animations: "disabled",
      });
    }
  });

  test("tab bar matches snapshot", async ({ page }) => {
    await expect(page.locator(".tab-bar")).toHaveScreenshot("tab-bar.png", {
      maxDiffPixelRatio: THRESHOLD,
      animations: "disabled",
    });
  });
});
