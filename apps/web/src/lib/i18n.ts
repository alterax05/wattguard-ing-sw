import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type LocaleCode,
} from "@wattguard/shared";
import en from "@wattguard/shared/locales/en/translation.json";
import it from "@wattguard/shared/locales/it/translation.json";
import de from "@wattguard/shared/locales/de/translation.json";

i18n.use(LanguageDetector).use(initReactI18next);

i18n.on("languageChanged", (lng: string) => {
  document.documentElement.lang = lng;
});

await i18n.init({
  resources: {
    en: { translation: en },
    it: { translation: it },
    de: { translation: de },
  },
  supportedLngs: [...SUPPORTED_LOCALES],
  fallbackLng: DEFAULT_LOCALE,
  nonExplicitSupportedLngs: true,
  load: "languageOnly",
  detection: {
    order: ["localStorage", "navigator"],
    caches: ["localStorage"],
    lookupLocalStorage: LOCALE_STORAGE_KEY,
  },
  interpolation: {
    escapeValue: false,
  },
});

document.documentElement.lang = i18n.language;

/**
 * Returns the current active locale for the UI.
 * Falls back to the default locale when i18next has not resolved a supported
 * language yet (e.g. during early module evaluation).
 */
export function getRequestLocale(): LocaleCode {
  const lng = i18n.language ?? i18n.resolvedLanguage;
  return isSupportedLocale(lng) ? lng : DEFAULT_LOCALE;
}

export default i18n;
