import { vi, beforeAll, afterAll } from "vitest";
import "@testing-library/jest-dom";

// Mock Tauri APIs globally for all tests
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
  })),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn().mockResolvedValue(null),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// Silence console.error for expected React errors in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("useAppContext must be used")) return;
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
