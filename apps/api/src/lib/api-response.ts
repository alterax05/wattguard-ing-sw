import type { ErrorCode, ErrorDetails, ErrorResponse, SuccessEnvelope } from "@wattguard/shared";

/**
 * Standard API error payload conforming to the discriminated union:
 * { success: false, error_code: ErrorCode, message: string, details?: ErrorDetails }
 *
 * `details` carries interpolation values for localized `errors.*` messages
 * that contain placeholders (e.g. `{ count }` for `building_type_in_use`).
 */
export function apiError(errorCode: ErrorCode, message: string, details?: ErrorDetails): ErrorResponse {
  return details === undefined
    ? {
        success: false as const,
        error_code: errorCode,
        message,
      }
    : {
        success: false as const,
        error_code: errorCode,
        message,
        details,
      };
}

/**
 * Standard API success payload conforming to the discriminated union:
 * { success: true, data: T }
 */
export function apiSuccess<T>(data: T): SuccessEnvelope<T> {
  return {
    success: true as const,
    data,
  };
}
