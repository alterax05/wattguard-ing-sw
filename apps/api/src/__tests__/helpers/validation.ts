/**
 * Test helper utilities for validation testing
 */
import { expect } from "bun:test";
import type { ErrorResponse, SuccessEnvelope } from "@wattguard/shared";

/** Validator (Zod) 400 body: `{ success, error, data }`. */
export interface ValidationErrorBody {
  success?: false;
  error: string | string[];
  data?: unknown;
}

export interface ExpectValidationErrorArgs {
  /** Parsed JSON body: the validator error, a manual error, or (unexpectedly) a success envelope. */
  data: ValidationErrorBody | ErrorResponse | SuccessEnvelope<unknown>;
  /** Numeric HTTP status of the response. */
  status: number;
  /** Optional field name expected to appear in the error payload. */
  fieldName?: string;
}

/**
 * Asserts that a response is a validation error (400)
 */
export function expectValidationError({ data, status, fieldName }: ExpectValidationErrorArgs) {
  expect(status).toBe(400);
  if (!("error" in data)) {
    return expect.unreachable("Expected error response body");
  }
  expect(data.error).toBeDefined();

  if (fieldName) {
    expect(JSON.stringify(data).toLowerCase()).toContain(fieldName.toLowerCase());
  }
}
