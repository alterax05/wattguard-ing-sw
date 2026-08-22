/**
 * Machine-readable error codes shared between the API and the web app.
 *
 * The API returns these codes in the `code` field of error responses
 * (`{ error, code }`). The web app maps each code to a localized message;
 * the `error` string is kept as an English fallback for unknown codes.
 */

export const ERROR_CODES = [
  // Generic
  "internal_server_error",
  "not_found",

  // Auth / middleware
  "account_disabled",
  "invalid_credentials",
  "unauthorized_invalid_token",
  "unauthorized_user_not_found",
  "forbidden_role",
  "admin_only",

  // Users / invites
  "user_not_found",
  "user_email_exists",
  "cannot_delete_own_account",
  "cannot_update_own_account",
  "invite_not_found",
  "invite_token_required",
  "invite_invalid_token",
  "invite_invalid_or_used",
  "invite_expired",
  "invite_invalid_status",
  "invite_pending_exists",
  "only_pending_invites_revocable",
  "invite_email_failed",
  "test_email_failed",

  // Reset password
  "invalid_reset_token",
  "reset_token_expired",

  // Buildings / building types
  "building_not_found",
  "building_type_not_found",
  "building_type_name_exists",
  "building_type_in_use",
  "buildings_not_found",
  "invalid_building_id",

  // Sensors
  "sensor_not_found",
  "sensor_serial_exists",

  // Alerts
  "alert_not_found",
  "alert_already_resolved",
  "alert_not_active",
  "invalid_alert_id",

  // Dashboard / settings / export
  "invalid_date_range",
  "settings_update_failed",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Type guard so route handlers can type error bodies against the contract. */
export function isErrorCode(value: string): value is ErrorCode {
  return ERROR_CODES.some((code) => code === value);
}
