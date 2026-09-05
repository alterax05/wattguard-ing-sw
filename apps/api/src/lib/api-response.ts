import type { ErrorCode, ErrorResponse, SuccessEnvelope } from "@wattguard/shared";

/**
 * Standard API error payload conforming to the discriminated union:
 * { success: false, error_code: ErrorCode, message: string }
 */
export function apiError(errorCode: ErrorCode, message: string): ErrorResponse {
  return {
    success: false as const,
    error_code: errorCode,
    message,
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
