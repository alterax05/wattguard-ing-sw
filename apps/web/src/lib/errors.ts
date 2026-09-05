import { z } from "zod";
import i18n from "./i18n";

/**
 * Body returned by API routes on failure, per the shared error contract:
 * a human-readable English `error` fallback plus a machine-readable `code`
 * used for localization.
 */
export interface ApiErrorBody {
  success?: boolean;
  error_code?: string;
  message?: string;
  error?: string;
  code?: string;
}

const ErrorBodySchema = z.object({
  success: z.literal(false).optional(),
  error_code: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
});

/**
 * Extract a localized, user-friendly message from an RPC error body.
 *
 * The API returns `{ success: false, error_code, message }` on failure. When a known machine-readable
 * `error_code` is present it is mapped to the localized `errors.<error_code>` catalog
 * entry; otherwise the raw `message` string is returned. When neither is
 * available (e.g. network errors) the localized `errors.generic` fallback is
 * used. `fallbackKey` may override the generic fallback with another
 * `errors.*` key.
 */
export function errorMessage(
  data: ApiErrorBody,
  fallbackKey = "errors.generic",
): string {
  const parsed = ErrorBodySchema.safeParse(data);

  if (!parsed.success) return localizedFallback(fallbackKey);

  const rawCode = parsed.data.error_code ?? parsed.data.code;
  const rawMsg = parsed.data.message ?? parsed.data.error;

  if (rawCode) {
    const key = `errors.${rawCode}`;
    const translated = i18n.exists(key) ? i18n.t(key) : null;
    if (translated) return translated;
  }
  return rawMsg ?? localizedFallback(fallbackKey);
}

function localizedFallback(fallbackKey: string): string {
  return i18n.exists(fallbackKey) ? i18n.t(fallbackKey) : fallbackKey;
}

/** Minimal shape of an RPC/fetch response needed to read its JSON body. */
interface JsonResponse {
  json(): Promise<object>;
}

/**
 * Read a failed RPC/fetch response at the I/O boundary and resolve its
 * localized error message. Resolves with the fallback when the body does not
 * match the `{ error, code }` contract.
 */
export async function errorMessageFromResponse(
  res: JsonResponse,
  fallbackKey = "errors.generic",
): Promise<string> {
  let body: ApiErrorBody | undefined;
  try {
    const parsed = ErrorBodySchema.safeParse(await res.json());
    body = parsed.success ? parsed.data : undefined;
  } catch {
    body = undefined;
  }
  return body ? errorMessage(body, fallbackKey) : localizedFallback(fallbackKey);
}
