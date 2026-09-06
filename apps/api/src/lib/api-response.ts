import type { ErrorCode, ErrorDetails, ErrorResponse, SuccessEnvelope } from "@wattguard/shared";

export function apiError(errorCode: ErrorCode, message: string, details?: ErrorDetails): ErrorResponse {
  return {
    success: false as const,
    error_code: errorCode,
    message,
    details,
  };
}

export function apiSuccess<T>(data: T): SuccessEnvelope<T> {
  return {
    success: true as const,
    data,
  };
}
