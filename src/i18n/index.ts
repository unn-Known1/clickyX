/**
 * i18n setup — English (default), Spanish, French, Japanese.
 *
 * All locale data lives in JSON files under ./locales/ so adding a new locale
 * is a one-file change. EN is the source of truth; other locales fall back to
 * EN when a key is missing.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enTranslation from "./locales/en.json";
import esTranslation from "./locales/es.json";
import frTranslation from "./locales/fr.json";
import jaTranslation from "./locales/ja.json";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      es: { translation: esTranslation },
      fr: { translation: frTranslation },
      ja: { translation: jaTranslation },
    },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    // P3/i18n: surface missing keys in dev console so dead strings don't rot.
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: (_lngs, _ns, key) => {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] missing key: ${key}`);
      }
    },
  });

export default i18n;

/** All supported locale codes for the language switcher. */
export const SUPPORTED_LOCALES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "ja", label: "日本語" },
];
