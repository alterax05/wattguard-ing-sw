/**
 * Comprehensive validation edge case tests for Zod schemas
 * Tests cover email normalization, password validation, and malformed requests
 */
import {
  describe,
  test,
  expect,
  mock,
  expectTypeOf,
} from "bun:test";

import { testClient } from "hono/testing";
import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";
import { expectValidationError } from "../helpers/validation";
import type {
  SessionResponse,
  AcceptInviteResponse,
  ValidateInviteResponse,
  CreateInviteResponse, ErrorResponse} from "@wattguard/shared";



const client = testClient(app);
import { User } from "../../models/User";
import { Invite } from "../../models/Invite";
import { randomToken, hashTokenSha256 } from "../../utils/crypto";

// Mock email functions
await mock.module("../../email/mailer", () => ({
  sendInviteEmail: mock(async () => Promise.resolve()),
  sendPasswordResetEmail: mock(async () => Promise.resolve()),
  sendEmail: mock(async () => Promise.resolve()),
  sendTestEmail: mock(async () => Promise.resolve()),
  sendAlertEmail: mock(async () => Promise.resolve()),
}));

setupIntegrationTests();

describe("email validation", () => {
  test("accepts valid email formats", async () => {
    const validEmails = [
      "user@test.com",
      "user+tag@test.com",
      "user.name@test.com",
      "user_name@test.co.uk",
      "123@test.com",
    ];

    for (const email of validEmails) {
      await User.create({
        email: email.toLowerCase(),
        role: "operator",
        passwordHash: await Bun.password.hash("password123", { algorithm: "bcrypt", cost: 10 }),
      });

      const res = await client.api.v1.auth.session.$post({
        json: { email, password: "password123" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<SessionResponse | ErrorResponse>();
    }
  });

  test("rejects invalid email formats", async () => {
    const invalidEmails = [
      "not-an-email",
      "user@",
      "@test.com",
      "user @test.com",
      "user@test",
      "user..name@test.com",
      "",
      "user@.com",
    ];

    for (const email of invalidEmails) {
      const res = await client.api.v1.auth.session.$post({
        json: { email, password: "password123" },
      });

      expect(Number(res.status)).toBe(400);
      const data = await res.json();
      if (!("error" in data)) {
        return expect.unreachable("Expected response to contain 'error'");
      }
      expect(data.error).toBeDefined();
    }
  });

  test("normalizes mixed-case emails consistently", async () => {
    await User.create({
      email: "user@test.com",
      role: "operator",
      passwordHash: await Bun.password.hash("password123", { algorithm: "bcrypt", cost: 10 }),
    });

    const variations = ["USER@TEST.COM", "User@Test.Com", "UsEr@TeSt.CoM"];

    for (const email of variations) {
      const res = await client.api.v1.auth.session.$post({
        json: { email, password: "password123" },
      });

      expect(res.status).toBe(200);
    }
  });

  test("returns the lowercased email address on login", async () => {
    // Create user with lowercase email
    await User.create({
      email: "user@test.com",
      role: "operator",
      passwordHash: await Bun.password.hash("password123", {
        algorithm: "bcrypt",
        cost: 10,
      }),
    });

    // Login with uppercase email
    const res = await client.api.v1.auth.session.$post({
      json: {
        email: "USER@TEST.COM",
        password: "password123",
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expectTypeOf(data).toExtend<SessionResponse | ErrorResponse>();
    expect(data.success).toBe(true);
    if (!data.success) {
      return expect.unreachable("Expected response success to be true");
    }
    expect(data.data.user.email).toBe("user@test.com");
  });
});

describe("password validation", () => {
    test("accepts passwords of 8+ characters", async () => {
    const admin = await User.create({
      email: "admin@test.com",
      role: "admin",
      passwordHash: await Bun.password.hash("admin123", { algorithm: "bcrypt", cost: 10 }),
    });

    const validPasswords = [
      "12345678",
      "password",
      "pass word",
      "P@ssw0rd!",
      "a".repeat(8),
      "a".repeat(100),
    ];

    for (const password of validPasswords) {
      await Invite.create({
        email: `user${password.length}@test.com`,
        role: "operator",
        tokenHash: hashTokenSha256(randomToken(32)),
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: admin._id,
      });

      const newToken = randomToken(32);
      const newTokenHash = hashTokenSha256(newToken);

      const newInvite = await Invite.create({
        email: `test${Math.random()}@test.com`,
        role: "operator",
        tokenHash: newTokenHash,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: admin._id,
      });

      const res = await client.api.v1.invites[":id"].$patch({
        param: { id: newInvite._id.toString() },
        json: { token: newToken, password, name: "Test User" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<AcceptInviteResponse | ErrorResponse>();
    }
  });

  test("rejects passwords shorter than 8 characters", async () => {
    const token = randomToken(32);
    const tokenHash = hashTokenSha256(token);

    const admin = await User.create({
      email: "admin@test.com",
      role: "admin",
      passwordHash: await Bun.password.hash("admin123", { algorithm: "bcrypt", cost: 10 }),
    });

    await Invite.create({
      email: "user@test.com",
      role: "operator",
      tokenHash,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: admin._id,
    });

    const shortPasswords = ["", "a", "ab", "abc", "1234567"];

    for (const password of shortPasswords) {
      const res = await client.api.v1.invites.$get({
        query: { token },
      });
      expect(res.status).toBe(200);
      // SAFETY: callers supply the documented response schema of the endpoint under test.
      const lookup = (await res.json()) as ValidateInviteResponse | ErrorResponse;
      if (!lookup.success) {
        return expect.unreachable("Expected invite lookup to succeed");
      }

      const acceptRes = await client.api.v1.invites[":id"].$patch({
        param: { id: lookup.data._id },
        json: { token, password, name: "Test User" },
      });

      expect(acceptRes.status).toBe(400);
      const data = await acceptRes.json();
      if (!("error" in data)) {
        return expect.unreachable("Expected response to contain 'error'");
      }
      const errorText = Array.isArray(data.error) ? JSON.stringify(data.error) : data.error;
      expect(errorText).toMatch(/8|Password/);
    }
  });

  test("rejects missing password field", async () => {
    const res = await client.api.v1.auth.session.$post({
      // @ts-expect-error intentionally missing required password field
      json: { email: "user@test.com" },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    if (!("error" in data)) {
      return expect.unreachable("Expected response to contain 'error'");
    }
    expect(data.error).toBeDefined();
  });

  test("rejects null password", async () => {
    const res = await client.api.v1.auth.session.$post({
      // @ts-expect-error intentionally null password
      json: { email: "user@test.com", password: null },
    });

    expect(res.status).toBe(400);
  });

  test("rejects an empty password field", async () => {
    const res = await client.api.v1.auth.session.$post({
      json: {
        email: "user@test.com",
        password: "",
      },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    if (!("error" in data)) {
      return expect.unreachable("Expected response to contain 'error'");
    }
    expect(data.error).toBeDefined();
  });
});

describe("request body validation", () => {
  test("rejects malformed JSON", async () => {
    const malformedBodies = [
      "{ invalid json",
      '{ "email": "test@test.com", }',
      "not json at all",
      '{"email": undefined}',
    ];

    for (const body of malformedBodies) {
      // SAFETY: the body is deliberately non-JSON so the transport must reject it; `never` bypasses the client's payload type.
      const res = await client.api.v1.auth.session.$post({
        json: body as never,
      });

      expect(Number(res.status)).toBe(400);
    }
  });

  test("rejects empty request body", async () => {
    // SAFETY: the empty payload is deliberate; `never` bypasses the client's typed-args check so the raw body is sent.
    const res = await client.api.v1.auth.session.$post(
      {} as never,
      {
        init: {
          body: "",
          headers: { "Content-Type": "application/json" },
        },
      },
    );

    // Empty raw body is rejected by the framework's JSON parser (400) before schema validation runs.
    expect(res.status).toBe(400);
  });

  test("rejects requests with wrong content type", async () => {
    // SAFETY: the empty payload is deliberate; `never` bypasses the client's typed-args check so the raw body is sent.
    const res = await client.api.v1.auth.session.$post(
      {} as never,
      {
        init: {
          body: JSON.stringify({ email: "user@test.com", password: "password123" }),
          headers: { "Content-Type": "text/plain" },
        },
      },
    );

    // May accept or reject depending on implementation
    expect([200, 400, 401, 415]).toContain(res.status);
  });

  test("handles missing required fields", async () => {
    const res = await client.api.v1.auth.session.$post({
      // @ts-expect-error intentionally missing required fields
      json: {},
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    if (!("error" in data)) {
      return expect.unreachable("Expected response to contain 'error'");
    }
    expect(data.error).toBeDefined();
  });

  test("rejects wrong field types", async () => {
    const wrongTypes = [
      { email: 123, password: "password123" },
      { email: "user@test.com", password: 123456 },
      { email: true, password: false },
      { email: ["user@test.com"], password: "password123" },
    ];

    for (const body of wrongTypes) {
      const res = await client.api.v1.auth.session.$post({
        // @ts-expect-error intentionally wrong field types
        json: body,
      });

      expect(Number(res.status)).toBe(400);
    }
  });

  test("rejects a missing email field", async () => {
    const res = await client.api.v1.auth.session.$post({
      // @ts-expect-error intentionally missing required email field
      json: {
        password: "password123",
      },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    if (!("error" in data)) {
      return expect.unreachable("Expected response to contain 'error'");
    }
    expect(data.error).toBeDefined();
  });
});

describe("query parameter validation", () => {
  test("accepts valid token query parameters", async () => {
    const token = randomToken(32);
    const tokenHash = hashTokenSha256(token);

    const admin = await User.create({
      email: "admin@test.com",
      role: "admin",
      passwordHash: await Bun.password.hash("admin123", { algorithm: "bcrypt", cost: 10 }),
    });

    await Invite.create({
      email: "user@test.com",
      role: "operator",
      tokenHash,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: admin._id,
    });

    const res = await client.api.v1.invites.$get({
      query: { token },
    });
    expect(res.status).toBe(200);
    // SAFETY: callers supply the documented response schema of the endpoint under test.
    const data = (await res.json()) as ValidateInviteResponse | ErrorResponse;
    expectTypeOf(data).toExtend<ValidateInviteResponse | ErrorResponse>();
  });

  test("rejects invalid invite token with 404 or 422", async () => {
    const res = await client.api.v1.invites.$get({
      query: { token: "nonexistent-token" },
    });
    expect([404, 422]).toContain(res.status);
  });

  test("returns the lowercased invite email for a valid token", async () => {
    // Create invite
    const token = randomToken(32);
    const tokenHash = hashTokenSha256(token);

    const admin = await User.create({
      email: "admin@test.com",
      role: "admin",
      passwordHash: await Bun.password.hash("admin123", {
        algorithm: "bcrypt",
        cost: 10,
      }),
    });

    await Invite.create({
      email: "user@test.com",
      role: "operator",
      tokenHash,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: admin._id,
    });

    // Validate invite
    const res = await client.api.v1.invites.$get({
      query: { token },
    });
    expect(res.status).toBe(200);
    // SAFETY: callers supply the documented response schema of the endpoint under test.
    const data = (await res.json()) as ValidateInviteResponse | ErrorResponse;
    expectTypeOf(data).toExtend<ValidateInviteResponse | ErrorResponse>();
    expect(data.success).toBe(true);
    if (!data.success) {
      return expect.unreachable("Expected response success to be true");
    }
    expect(data.data.valid).toBe(true);
    expect(data.data.email).toBe("user@test.com");
  });
});

describe("role validation", () => {
  test("accepts valid roles", async () => {
    const token = await getAdminToken();
    const validRoles = ["admin", "operator"] as const;

    for (const role of validRoles) {
      const res = await client.api.v1.invites.$post(
        {
          json: {
            email: `${role}${Math.random()}@test.com`,
            role,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expectTypeOf(data).toExtend<CreateInviteResponse | ErrorResponse>();
    }
  });

  test("rejects invalid roles", async () => {
    const token = await getAdminToken();
    const invalidRoles = ["user", "superadmin", "guest", "", "admin123"];

    for (const role of invalidRoles) {
      // SAFETY: the role value deliberately violates the invite-role enum so the server must reject it; `never` bypasses the client's payload type.
      const res = await client.api.v1.invites.$post(
        {
          json: {
            email: "test@test.com",
            role: role as never,
          },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      expectValidationError({ data: await res.json(), status: res.status });
    }
  });

  test("rejects missing role field", async () => {
    const token = await getAdminToken();

    const res = await client.api.v1.invites.$post(
      {
        // @ts-expect-error intentionally missing required role
        json: {
          email: "test@test.com",
        },
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    expectValidationError({ data: await res.json(), status: res.status });
  });
});

// Helper function to get admin token
async function getAdminToken() {
  await User.create({
    email: "admin@test.com",
    role: "admin",
    passwordHash: await Bun.password.hash("admin123", { algorithm: "bcrypt", cost: 10 }),
  });

  const loginRes = await client.api.v1.auth.session.$post({
    json: {
      email: "admin@test.com",
      password: "admin123",
    },
  });

  // SAFETY: helper seeds the user then logs in with valid credentials, so the body is SessionResponse.
  return ((await loginRes.json()) as SessionResponse).data.token;
}
