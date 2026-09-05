/**
 * Test helper utilities for validation testing
 */
import { expect } from "bun:test";
import { testClient } from "hono/testing";
import { app } from "../../index";
import { User } from "../../models/User";
import type { UserRole } from "@wattguard/shared";

export const client = testClient(app);

export interface ResponseLike {
  status: number;
  json(): Promise<object>;
}

/**
 * Asserts that a response is a validation error (400)
 */
export async function expectValidationError(response: ResponseLike, fieldName?: string) {
  expect(response.status).toBe(400);
  // SAFETY: the API returns a JSON body with its message under `error` on 400 responses.
  const data = (await response.json()) as { error?: string | string[] };
  expect(data.error).toBeDefined();
  
  if (fieldName) {
    const errorStr = JSON.stringify(data);
    expect(errorStr.toLowerCase()).toContain(fieldName.toLowerCase());
  }
}

/**
 * Asserts that a response is unauthorized (401)
 */
export function expectUnauthorized(response: { status: number }) {
  expect(response.status).toBe(401);
}

/**
 * Asserts that a response is forbidden (403)
 */
export function expectForbidden(response: { status: number }) {
  expect(response.status).toBe(403);
}

/**
 * Asserts that a response is not found (404)
 */
export function expectNotFound(response: { status: number }) {
  expect(response.status).toBe(404);
}

/**
 * Asserts that a response is successful with expected data
 */
/**
 * Asserts that a response is successful and returns its JSON payload. The
 * expected payload shape is supplied by the caller via the type parameter.
 */
export async function expectSuccess<T>(response: Response, status = 200): Promise<T> {
  expect(response.status).toBe(status);
  // SAFETY: callers supply the documented response schema of the endpoint under test.
  const data = (await response.json()) as T;
  return data;
}

/**
 * Creates a test user and returns auth token
 */
export async function createUserAndGetToken(
  email: string,
  password: string,
  role: UserRole = "operator"
) {
  await User.create({
    email,
    role,
    passwordHash: await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 10,
    }),
  });

  const loginRes = await client.api.v1.auth.session.$post({
    json: { email, password },
  });

  const setCookieHeader = loginRes.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error("No auth cookie returned");
  }

  const tokenMatch = setCookieHeader.match(/access_token=([^;]+)/);
  if (!tokenMatch) {
    throw new Error("No token in cookie");
  }

  return tokenMatch[1];
}

/**
 * Type-safe signature for a typed Hono client request that accepts a
 * RequestInit (e.g. `(init) => client.api.v1...$get({ ... }, init)`).
 */
type TypedRequest = (init: RequestInit) => Promise<Response>;

/**
 * Runs a typed client request injecting a Bearer token into its headers
 */
export async function authenticatedRequest(
  request: TypedRequest,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return request({
    ...options,
    headers,
  });
}

/**
 * JSON-serializable payload sent through raw-transport helpers like
 * `postJSON`; mirrors what `JSON.stringify` can encode.
 */
export type JsonTestPayload =
  | string
  | number
  | boolean
  | null
  | JsonTestPayload[]
  | { [key: string]: JsonTestPayload };

/**
 * Runs a typed JSON POST request, optionally with a Bearer token
 */
export async function postJSON(
  request: TypedRequest,
  body: JsonTestPayload,
  token?: string
): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return request({
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Test data generators
 */
export const testData = {
  validEmails: [
    "user@test.com",
    "user+tag@test.com",
    "user.name@test.com",
    "user_name@test.co.uk",
  ],
  
  invalidEmails: [
    "not-an-email",
    "user@",
    "@test.com",
    "user @test.com",
    "",
  ],
  
  validPasswords: [
    "password123",
    "P@ssw0rd!",
    "abcdefgh",
    "12345678",
  ],
  
  invalidPasswords: [
    "short",
    "1234567",
    "",
    "abc",
  ],
  
  validRoles: ["admin", "operator"] as const,
  
  invalidRoles: ["user", "superadmin", "guest", ""],
};

/**
 * Assertion helpers for common response patterns
 */
export const assertions = {
  /**
   * Checks if response has error field
   */
  async hasError(response: Response): Promise<boolean> {
    // SAFETY: API error responses are JSON objects carrying their message under `error`.
    const data = (await response.json()) as { error?: unknown };
    return !!data.error;
  },

  /**
   * Checks if response has success field
   */
  async hasSuccess(response: Response): Promise<boolean> {
    // SAFETY: success responses are JSON objects carrying their flag under `success`.
    const data = (await response.json()) as { success?: boolean };
    return data.success === true;
  },

  /**
   * Gets error message from response
   */
  async getErrorMessage(response: Response): Promise<string> {
    // SAFETY: API error responses are JSON objects carrying their message under `error`.
    const data = (await response.json()) as { error?: string };
    return data.error || "";
  },

  /**
   * Checks if error message contains expected text
   */
  async errorContains(response: Response, text: string): Promise<boolean> {
    const message = await this.getErrorMessage(response);
    return message.toLowerCase().includes(text.toLowerCase());
  },
};
