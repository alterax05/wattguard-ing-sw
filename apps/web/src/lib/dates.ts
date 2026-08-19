import { de, enGB, it, type Locale } from "date-fns/locale";
import { getRequestLocale } from "./i18n";

/**
 * Converts a Date into an ISO string, or `undefined` when the date is
 * missing or invalid. Use it at the API boundary so that invalid or
 * incomplete date ranges never reach the requests.
 */
export function toIsoDate(date: Date | undefined): string | undefined {
  if (!date || Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

/**
 * Locale resources for the active UI language, keyed by the app language
 * code: the date-fns `Locale` for date formatting and the BCP-47 tag for
 * `Intl`-based formatting (`toLocaleString`, `toLocaleTimeString`, ...).
 */
const LOCALE_TABLE: Record<string, { dateFns: Locale; intl: string }> = {
  it: { dateFns: it, intl: "it-IT" },
  de: { dateFns: de, intl: "de-DE" },
  en: { dateFns: enGB, intl: "en-GB" },
};

function resolveLocales() {
  return LOCALE_TABLE[getRequestLocale()] ?? LOCALE_TABLE.en!;
}

/**
 * Resolves the date-fns locale matching the active UI language.
 */
export function getDateFnsLocale(): Locale {
  return resolveLocales().dateFns;
}

/**
 * Resolves the BCP-47 locale tag matching the active UI language, suitable
 * for `Intl`-based formatting (`toLocaleString`, `toLocaleTimeString`, ...).
 */
export function getIntlLocale(): string {
  return resolveLocales().intl;
}
