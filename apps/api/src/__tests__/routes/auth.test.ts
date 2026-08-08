/**
 * Integration tests for authentication flows
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { Invite } from "../../models/Invite";
import { PasswordResetToken } from "../../models/PasswordResetToken";
import { randomToken, hashTokenSha256 } from "../../utils/crypto";

// Mock email functions to avoid email requirements in tests
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

describe("Authentication Integration Tests", () => {
  describe("Invite Flow", () => {
    test("should create an admin user and create an invite", async () => {
      // Create admin user directly
      const adminPasswordHash = await Bun.password.hash("admin123", {
        algorithm: "bcrypt",
        cost: 10,
      });

      await User.create({
        email: "admin@test.com",
        role: "admin",
        isDisabled: false,
        passwordHash: adminPasswordHash,
      });

      // Login as admin
      const loginRes = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@test.com",
          password: "admin123",
        }),
      });

      expect(loginRes.status).toBe(200);
      const loginData = await loginRes.json();
      expect(loginData.success).toBe(true);

      // Extract JWT from Set-Cookie header
      const setCookieHeader = loginRes.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      const tokenMatch = setCookieHeader!.match(/access_token=([^;]+)/);
      expect(tokenMatch).toBeDefined();
      const token = tokenMatch![1];

      // Create invite
      const inviteRes = await app.request("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: "user@test.com",
          role: "operator",
        }),
      });

      expect(inviteRes.status).toBe(201);
      const inviteData = await inviteRes.json();
      expect(inviteData.success).toBe(true);
      expect(inviteData.invite.email).toBe("user@test.com");
    });

    test("should validate an invite token", async () => {
      // Create invite manually
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
      const res = await app.request(`/api/invites/validate?token=${token}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.email).toBe("user@test.com");
    });
  });

  describe("Local Password Auth", () => {
    test("should setup password for invited user", async () => {
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

      // Setup password
      const res = await app.request("/api/auth/local/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteToken: token,
          password: "password123",
          name: "Test User",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe("user@test.com");

      // Verify user was created
      const user = await User.findOne({ email: "user@test.com" });
      expect(user).toBeDefined();
      expect(user!.passwordHash).toBeDefined();

      // Verify invite was marked as accepted
      const invite = await Invite.findOne({ tokenHash });
      expect(invite!.status).toBe("accepted");
    });

    test("should login with valid credentials", async () => {
      // Create user
      await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      // Login
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@test.com",
          password: "password123",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe("user@test.com");

      // Check cookie was set
      const setCookieHeader = res.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain("access_token=");
    });

    test("should reject login with invalid credentials", async () => {
      // Create user
      await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      // Login with wrong password
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@test.com",
          password: "wrongpassword",
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  describe("Protected Routes", () => {
    test("should access protected route with valid token", async () => {
      // Create user and login
      await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      const loginRes = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@test.com",
          password: "password123",
        }),
      });

      const setCookieHeader = loginRes.headers.get("set-cookie");
      const tokenMatch = setCookieHeader!.match(/access_token=([^;]+)/);
      const token = tokenMatch![1];

      // Access protected route
      const res = await app.request("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.email).toBe("user@test.com");
    });

    test("should reject access without token", async () => {
      const res = await app.request("/api/auth/me");
      expect(res.status).toBe(401);
    });

    test("should reject operator from admin routes", async () => {
      // Create operator user
      await User.create({
        email: "operator@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      const loginRes = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "operator@test.com",
          password: "password123",
        }),
      });

      const setCookieHeader = loginRes.headers.get("set-cookie");
      const tokenMatch = setCookieHeader!.match(/access_token=([^;]+)/);
      const token = tokenMatch![1];

      // Try to access admin route
      const res = await app.request("/api/admin/invites", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("Validation Edge Cases", () => {
    test("should normalize email to lowercase on login", async () => {
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
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "USER@TEST.COM",
          password: "password123",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe("user@test.com");
    });

    test("should normalize email with mixed case on login", async () => {
      // Create user
      await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      // Login with mixed case email
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "User@Test.COM",
          password: "password123",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    test("should reject invalid email format on login", async () => {
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "not-an-email",
          password: "password123",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      // Zod validation returns array of errors
      expect(Array.isArray(data.error) ? JSON.stringify(data.error) : data.error).toContain("email");
    });

    test("should reject password shorter than 8 characters on setup", async () => {
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

      // Try to setup with short password
      const res = await app.request("/api/auth/local/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteToken: token,
          password: "short",
          name: "Test User",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      // Zod validation returns array of errors or string
      const errorText = Array.isArray(data.error) ? JSON.stringify(data.error) : data.error;
      expect(errorText).toMatch(/8|Password/);
    });

    test("should reject empty password field", async () => {
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@test.com",
          password: "",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("should reject missing email field", async () => {
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: "password123",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("should reject missing password field", async () => {
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@test.com",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("should reject malformed JSON request body", async () => {
      const res = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ invalid json",
      });

      expect(res.status).toBe(400);
    });

    test("should normalize email on invite validation", async () => {
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
      const res = await app.request(`/api/invites/validate?token=${token}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.email).toBe("user@test.com");
    });

    test("should reject missing token query parameter", async () => {
      const res = await app.request("/api/invites/validate");
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("should reject empty token query parameter", async () => {
      const res = await app.request("/api/invites/validate?token=");
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  describe("Password Reset Flow", () => {
    test("should request password reset for existing user", async () => {
      // Create user
      await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("oldpassword", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      // Request reset
      const res = await app.request("/api/auth/local/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@test.com" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify reset token was created
      const user = await User.findOne({ email: "user@test.com" });
      const resetToken = await PasswordResetToken.findOne({ userId: user!._id });
      expect(resetToken).toBeDefined();
    });

    test("should complete full password reset flow", async () => {
      // Create user
      const user = await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("oldpassword", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      // Create reset token manually
      const token = randomToken(32);
      const tokenHash = hashTokenSha256(token);

      await PasswordResetToken.create({
        userId: user._id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });

      // Validate token
      const validateRes = await app.request(
        `/api/auth/local/validate-reset-token?token=${token}`
      );
      expect(validateRes.status).toBe(200);

      // Reset password
      const resetRes = await app.request("/api/auth/local/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: "newpassword123",
        }),
      });

      expect(resetRes.status).toBe(200);
      const resetData = await resetRes.json();
      expect(resetData.success).toBe(true);

      // Verify token was deleted
      const deletedToken = await PasswordResetToken.findOne({ tokenHash });
      expect(deletedToken).toBeNull();

      // Login with new password
      const loginRes = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@test.com",
          password: "newpassword123",
        }),
      });

      expect(loginRes.status).toBe(200);

      // Verify old password doesn't work
      const oldLoginRes = await app.request("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@test.com",
          password: "oldpassword",
        }),
      });

      expect(oldLoginRes.status).toBe(401);
    });

    test("should reject expired reset token", async () => {
      const user = await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      // Create expired reset token
      const token = randomToken(32);
      const tokenHash = hashTokenSha256(token);

      await PasswordResetToken.create({
        userId: user._id,
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      // Try to use expired token
      const res = await app.request("/api/auth/local/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: "newpassword123",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("expired");
    });
  });
});
