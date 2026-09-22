// P2 (H-21): frontend lint gate — enforces AGENTS.md rules mechanically
// (typed bindings usage, react-hooks correctness). Run: npm run lint
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dev-dist/**",
      "node_modules/**",
      "src-tauri/target/**",
      "playwright-report/**",
      "test-results/**",
      "e2e/**/*.ts-snapshots/**",
      "public/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, process: "readonly" },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // 700+ legacy `any`s are warnings (ratchet to error per-file later),
      // but NEW untyped code should still prefer `unknown`.
      "@typescript-eslint/no-explicit-any": "warn",
      // AGENTS.md rule: all invoke() calls go through src/bindings.ts —
      // flag raw @tauri-apps/api imports anywhere else.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tauri-apps/api/core",
              message: "Use typed wrappers from src/bindings.ts instead of raw invoke().",
            },
          ],
        },
      ],
    },
  },
  // Node scripts (skills, tooling, configs): CommonJS + node globals.
  {
    files: [
      "**/*.js",
      "**/*.cjs",
      "playwright.config.ts",
      "vitest.config.ts",
      "vite.config.ts",
      "eslint.config.mjs",
      "scripts/**/*",
      "skills/**/*",
    ],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Test files: relax a few rules.
  {
    files: ["**/*.test.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Tests mock the raw API directly; bindings.ts IS the sanctioned wrapper.
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["src/bindings.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
