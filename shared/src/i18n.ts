/**
 * Locale constants shared between the web app and the API.
 *
 * The actual translation catalogs live in `shared/locales/<lng>/translation.json`
 * (see package.json exports `./locales/*`). Both apps load them into i18next:
 * - web: `i18next` + `react-i18next` (resources imported statically)
 * - api: `i18next` (resources imported statically)
 */

export const SUPPORTED_LOCALES = ["en", "it", "de"] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: LocaleCode = "en";

export const LOCALE_STORAGE_KEY = "wattguard-language";

export function isSupportedLocale(value: string | null | undefined): value is LocaleCode {
  return value != null && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
