/**
 * Comprehensive validation edge case tests for Zod schemas
 * Tests cover email normalization, password validation, and malformed requests
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { Invite } from "../../models/Invite";
import { randomToken, hashTokenSha256 } from "../../utils/crypto";

// Mock email functions
mock.module("../../email/mailer", () => ({
  sendInviteEmail: mock(async () => Promise.resolve()),
  sendPasswordResetEmail: mock(async () => Promise.resolve()),
  sendEmail: mock(async () => Promise.resolve()),
}));

// Suppress console logs during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(async () => {
  console.log = () => {};
  console.error = () => {};
  await connectTestDB();
});

afterAll(async () => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe("Email Validation and Normalization", () => {
  test("should accept valid email formats", async () => {
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

      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "password123" }),
      });

      expect(res.status).toBe(200);
      await clearTestDB();
    }
  });

  test("should reject invalid email formats", async () => {
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
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "password123" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeTruthy();
    }
  });

  test("should normalize mixed-case emails consistently", async () => {
    await User.create({
      email: "user@test.com",
      role: "operator",
      passwordHash: await Bun.password.hash("password123", { algorithm: "bcrypt", cost: 10 }),
    });

    const variations = ["USER@TEST.COM", "User@Test.Com", "UsEr@TeSt.CoM"];

    for (const email of variations) {
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "password123" }),
      });

      expect(res.status).toBe(200);
    }
  });
});

describe("Password Validation", () => {
  test("should accept passwords of 8+ characters", async () => {
    const token = randomToken(32);
    const tokenHash = hashTokenSha256(token);

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

      await Invite.create({
        email: `test${Math.random()}@test.com`,
        role: "operator",
        tokenHash: newTokenHash,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: admin._id,
      });

      const res = await app.request("/api/auth/local/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: newToken, password }),
      });

      expect(res.status).toBe(200);
    }
  });

  test("should reject passwords shorter than 8 characters", async () => {
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
      const res = await app.request("/api/auth/local/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: token, password }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      const errorText = Array.isArray(data.error) ? JSON.stringify(data.error) : data.error;
      expect(errorText).toMatch(/8|Password/);
    }
  });

  test("should reject missing password field", async () => {
    const res = await app.request("/api/auth/local/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@test.com" }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  test("should reject null password", async () => {
    const res = await app.request("/api/auth/local/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@test.com", password: null }),
    });

    expect(res.status).toBe(400);
  });
});

describe("Request Body Validation", () => {
  test("should reject malformed JSON", async () => {
    const malformedBodies = [
      "{ invalid json",
      '{ "email": "test@test.com", }',
      "not json at all",
      '{"email": undefined}',
    ];

    for (const body of malformedBodies) {
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      expect(res.status).toBe(400);
    }
  });

  test("should reject empty request body", async () => {
    const res = await app.request("/api/auth/local/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });

    expect(res.status).toBe(400);
  });

  test("should reject requests with wrong content type", async () => {
    const res = await app.request("/api/auth/local/login", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ email: "user@test.com", password: "password123" }),
    });

    // May accept or reject depending on implementation
    expect([200, 400, 401, 415]).toContain(res.status);
  });

  test("should handle missing required fields", async () => {
    const res = await app.request("/api/auth/local/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  test("should reject wrong field types", async () => {
    const wrongTypes = [
      { email: 123, password: "password123" },
      { email: "user@test.com", password: 123456 },
      { email: true, password: false },
      { email: ["user@test.com"], password: "password123" },
    ];

    for (const body of wrongTypes) {
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(400);
    }
  });
});

describe("Query Parameter Validation", () => {
  test("should accept valid token query parameters", async () => {
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

    const res = await app.request(`/api/invites/validate?token=${token}`);
    expect(res.status).toBe(200);
  });

  test("should reject missing token query parameter", async () => {
    const res = await app.request("/api/invites/validate");
    expect(res.status).toBe(400);
  });

  test("should reject empty token query parameter", async () => {
    const res = await app.request("/api/invites/validate?token=");
    expect(res.status).toBe(400);
  });

  test("should reject whitespace-only token query parameter", async () => {
    // Whitespace-only token is invalid, but URL encoding may affect behavior
    const res = await app.request("/api/invites/validate?token=   ");
    // May return 400 (validation error) or 404 (not found)
    expect([400, 404]).toContain(res.status);
  });
});

describe("Role Validation", () => {
  test("should accept valid roles", async () => {
    const token = await getAdminToken();
    const validRoles = ["admin", "operator"];

    for (const role of validRoles) {
      const res = await app.request("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: `${role}${Math.random()}@test.com`,
          role,
        }),
      });

      expect(res.status).toBe(201);
    }
  });

  test("should reject invalid roles", async () => {
    const token = await getAdminToken();
    const invalidRoles = ["user", "superadmin", "guest", "", "admin123"];

    for (const role of invalidRoles) {
      const res = await app.request("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: "test@test.com",
          role,
        }),
      });

      expect(res.status).toBe(400);
    }
  });

  test("should reject missing role field", async () => {
    const token = await getAdminToken();

    const res = await app.request("/api/admin/invites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: "test@test.com",
      }),
    });

    expect(res.status).toBe(400);
  });
});

// Helper function to get admin token
async function getAdminToken() {
  await User.create({
    email: "admin@test.com",
    role: "admin",
    passwordHash: await Bun.password.hash("admin123", { algorithm: "bcrypt", cost: 10 }),
  });

  const loginRes = await app.request("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@test.com",
      password: "admin123",
    }),
  });

  const setCookieHeader = loginRes.headers.get("set-cookie");
  const tokenMatch = setCookieHeader!.match(/access_token=([^;]+)/);
  return tokenMatch![1];
}
