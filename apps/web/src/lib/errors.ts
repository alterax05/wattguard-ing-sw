import i18n from "./i18n";

/**
 * Extract a localized, user-friendly message from an RPC error body.
 *
 * The API returns `{ error, code }` on failure. When a known machine-readable
 * `code` is present it is mapped to the localized `errors.<code>` catalog
 * entry; otherwise the raw `error` string is returned. When neither is
 * available (e.g. network errors) the localized `errors.generic` fallback is
 * used. `fallbackKey` may override the generic fallback with another
 * `errors.*` key.
 */
export function errorMessage(
  data: unknown,
  fallbackKey = "errors.generic",
): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.code === "string" && record.code) {
      const key = `errors.${record.code}`;
      const translated = i18n.exists(key) ? i18n.t(key) : null;
      if (translated) return translated;
    }
    if (typeof record.error === "string" && record.error) {
      return record.error;
    }
  }
  return i18n.exists(fallbackKey) ? i18n.t(fallbackKey) : fallbackKey;
}
