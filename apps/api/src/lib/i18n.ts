/**
 * Server-side i18next instance backed by the shared translation catalogs
 * (`shared/locales/<lng>/translation.json`, statically imported so catalogs
 * are bundled instead of read from disk at runtime).
 *
 * The web app uses react-i18next with the same catalogs; the API uses this
 * instance for localized emails and generated reports. `getTranslator(lng)`
 * returns an i18next `t` function bound to the requested language (English is
 * the fallback for unsupported/missing languages).
 */
import i18next from "i18next";
import type { TFunction } from "i18next";
import type { Context } from "hono";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type LocaleCode,
} from "@wattguard/shared";
import en from "@wattguard/shared/locales/en/translation.json";
import it from "@wattguard/shared/locales/it/translation.json";
import de from "@wattguard/shared/locales/de/translation.json";

const RESOURCES = {
  en: { translation: en },
  it: { translation: it },
  de: { translation: de },
};

const i18n = i18next.createInstance();

let initPromise: Promise<unknown> | null = null;

/**
 * Initialize the i18next instance (idempotent). Catalogs are bundled, so
 * initialization is synchronous and `getTranslator` is usable as soon as this
 * promise resolves.
 */
export function ensureI18nReady(): Promise<void> {
  initPromise ??= i18n.init({
    initAsync: false,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    preload: [...SUPPORTED_LOCALES],
    ns: ["translation"],
    defaultNS: "translation",
    resources: RESOURCES,
    // Catalog values (email HTML, report labels) are authored content, not
    // untrusted user input — no HTML-escaping at interpolation time.
    interpolation: { escapeValue: false },
  });

  return initPromise.then(() => undefined);
}

/**
 * Resolve the request locale set by the Hono `languageDetector` middleware.
 * The middleware is configured with `supportedLanguages` + `fallbackLanguage`,
 * so it always returns a supported `LocaleCode`.
 */
export function getRequestLocale(c: Context): LocaleCode {
  // SAFETY: the languageDetector middleware is configured with
  // supportedLanguages + fallbackLanguage from SUPPORTED_LOCALES, so the
  // request variable always holds a supported LocaleCode.
  return c.get("language") as LocaleCode;
}

/**
 * Return an i18next `t` function bound to the given language. Languages not in
 * `supportedLngs` resolve through i18next's fallback chain to English.
 */
export function getTranslator(lng: LocaleCode): TFunction {
  return i18n.getFixedT(lng, "translation");
}
