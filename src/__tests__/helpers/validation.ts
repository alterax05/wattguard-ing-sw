/**
 * Test helper utilities for validation testing
 */
import { expect } from "bun:test";
import { app } from "../../index";
import { User } from "../../models/User";

/**
 * Asserts that a response is a validation error (400)
 */
export async function expectValidationError(response: Response, fieldName?: string) {
  expect(response.status).toBe(400);
  const data = await response.json();
  expect(data.error).toBeTruthy();
  
  if (fieldName) {
    expect(data.error.toLowerCase()).toContain(fieldName.toLowerCase());
  }
}

/**
 * Asserts that a response is unauthorized (401)
 */
export async function expectUnauthorized(response: Response) {
  expect(response.status).toBe(401);
}

/**
 * Asserts that a response is forbidden (403)
 */
export async function expectForbidden(response: Response) {
  expect(response.status).toBe(403);
}

/**
 * Asserts that a response is not found (404)
 */
export async function expectNotFound(response: Response) {
  expect(response.status).toBe(404);
}

/**
 * Asserts that a response is successful with expected data
 */
export async function expectSuccess(response: Response, status = 200) {
  expect(response.status).toBe(status);
  const data = await response.json();
  return data;
}

/**
 * Creates a test user and returns auth token
 */
export async function createUserAndGetToken(
  email: string,
  password: string,
  role: "admin" | "operator" = "operator"
) {
  await User.create({
    email,
    role,
    passwordHash: await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 10,
    }),
  });

  const loginRes = await app.request("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
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
 * Makes an authenticated request with Bearer token
 */
export async function authenticatedRequest(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  return app.request(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Makes a POST request with JSON body
 */
export async function postJSON(url: string, body: any, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return app.request(url, {
    method: "POST",
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
    const data = await response.json();
    return !!data.error;
  },

  /**
   * Checks if response has success field
   */
  async hasSuccess(response: Response): Promise<boolean> {
    const data = await response.json();
    return data.success === true;
  },

  /**
   * Gets error message from response
   */
  async getErrorMessage(response: Response): Promise<string> {
    const data = await response.json();
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
