/**
 * Machine-readable error codes shared between the API and the web app.
 *
 * The API returns these codes in the `code` field of error responses
 * (`{ error, code }`). The web app maps each code to a localized message;
 * the `error` string is kept as an English fallback for unknown codes.
 */

import en from "../locales/en/translation.json";

export type ErrorCode = keyof typeof en.errors;

