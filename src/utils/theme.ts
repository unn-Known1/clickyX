/**
 * Theme helpers (P3).
 *
 * Single owner for resolving + applying the effective theme:
 *   effective = stored color variant || (base, with "system" → media query)
 *
 * The color variant lives in localStorage (not backend config) because it is
 * pure presentation — the backend `theme` field owns light/dark/system only.
 * App.tsx applies via `applyTheme` on every config change so a variant is
 * never stomped by the base-theme sync effect.
 */

export const THEME_VARIANT_KEY = "clickyx-theme-variant";

export const THEME_VARIANTS: { value: string; label: string }[] = [
  { value: "", label: "Default" },
  { value: "sunset", label: "Sunset" },
  { value: "forest", label: "Forest" },
  { value: "ocean", label: "Ocean" },
  { value: "lavender", label: "Lavender" },
  { value: "rose", label: "Rose" },
  { value: "amber", label: "Amber" },
];

export function getStoredVariant(): string {
  try {
    return window.localStorage.getItem(THEME_VARIANT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStoredVariant(variant: string): void {
  try {
    if (variant) window.localStorage.setItem(THEME_VARIANT_KEY, variant);
    else window.localStorage.removeItem(THEME_VARIANT_KEY);
  } catch {
    /* storage unavailable — variant simply won't persist */
  }
}

function systemIsDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolveTheme(base: string, variant: string): string {
  if (variant) return variant;
  if (base === "system") return systemIsDark() ? "dark" : "light";
  return base || "dark";
}

/** Apply the effective theme to <html data-theme>. Returns the applied value. */
export function applyTheme(base: string): string {
  const effective = resolveTheme(base, getStoredVariant());
  document.documentElement.setAttribute("data-theme", effective);
  return effective;
}
