/**
 * Server-side i18next instance loading the shared translation catalogs
 * from `shared/locales/<lng>/<ns>.json` via i18next-fs-backend.
 *
 * The web app uses react-i18next with the same catalogs; the API uses this
 * instance for localized emails and generated reports. `getTranslator(lng)`
 * returns an i18next `t` function bound to the requested language (English is
 * the fallback for unsupported/missing languages).
 */
import path from "path";
import { existsSync } from "node:fs";
import i18next from "i18next";
import Backend from "i18next-fs-backend";
import type { TFunction } from "i18next";
import type { Context } from "hono";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type LocaleCode,
} from "@wattguard/shared";

/**
 * Resolve the translation file for a language/namespace.
 *
 * Primary path is relative to `process.cwd()` (the `apps/api` package in dev
 * and prod). When the API tests are invoked from the monorepo root
 * (`bun test apps/api/...`), cwd is the repo root, so fall back to a path
 * relative to this module.
 */
function resolveLoadPath(lng: string, ns: string): string {
  const candidates = [
    path.join(
      process.cwd(),
      "..",
      "..",
      "shared",
      "locales",
      lng,
      `${ns}.json`,
    ),
    path.resolve(
      import.meta.dir,
      "../../../../shared/locales",
      lng,
      `${ns}.json`,
    ),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0]!;
}

const i18n = i18next.createInstance();

let initPromise: Promise<unknown> | null = null;

/**
 * Initialize the i18next instance (idempotent). Backend resources are loaded
 * synchronously (`initAsync: false`), so `getTranslator` is usable as soon as
 * this promise resolves.
 */
export function ensureI18nReady(): Promise<void> {
  initPromise ??= i18n.use(Backend).init({
    initAsync: false,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    preload: [...SUPPORTED_LOCALES],
    ns: ["translation"],
    defaultNS: "translation",
    // Catalog values (email HTML, report labels) are authored content, not
    // untrusted user input — no HTML-escaping at interpolation time.
    interpolation: { escapeValue: false },
    backend: {
      loadPath: (lng: string, ns: string) => resolveLoadPath(lng, ns),
    },
  });

  return initPromise.then(() => undefined);
}

/**
 * Resolve the request locale set by the Hono `languageDetector` middleware.
 * The middleware is configured with `supportedLanguages` + `fallbackLanguage`,
 * so it always returns a supported `LocaleCode`.
 */
export function getRequestLocale(c: Context): LocaleCode {
  return c.get("language") as LocaleCode;
}

/**
 * Return an i18next `t` function bound to the given language. Languages not in
 * `supportedLngs` resolve through i18next's fallback chain to English.
 */
export function getTranslator(lng: LocaleCode): TFunction {
  return i18n.getFixedT(lng, "translation");
}