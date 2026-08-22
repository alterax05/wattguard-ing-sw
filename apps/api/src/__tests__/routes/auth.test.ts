/**
 * Integration tests for authentication flows
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  mock,
  expectTypeOf,
} from "bun:test";

import { testClient } from "hono/testing";
import { z } from "zod";
import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";
import { User } from "../../models/User";
import { Invite } from "../../models/Invite";
import { PasswordResetToken } from "../../models/PasswordResetToken";
import { randomToken, hashTokenSha256 } from "../../utils/crypto";
import { ErrorSchema } from "@wattguard/shared";
import type {
  ValidateInviteResponse,
  SetupResponse,
  LoginResponse,
  ForgotPasswordResponse,
  ValidateResetTokenResponse,
  ResetPasswordResponse,
  MeResponse,
  LogoutResponse,
  TestEmailResponse,
  CreateInviteResponse,
  ListInvitesResponse,
} from "@wattguard/shared";

type ErrorResponse = z.infer<typeof ErrorSchema>;

const client = testClient(app);

// Mock email functions to avoid email requirements in tests
await mock.module("../../email/mailer", () => ({
  sendInviteEmail: mock(async () => Promise.resolve()),
  sendPasswordResetEmail: mock(async () => Promise.resolve()),
  sendEmail: mock(async () => Promise.resolve()),
  sendTestEmail: mock(async () => Promise.resolve()),
  sendAlertEmail: mock(async () => Promise.resolve()),
}));

// Suppress console logs during tests

setupIntegrationTests(import.meta.path);


beforeEach(async () => {
});

describe("auth api", () => {
  describe("invite flow", () => {
    test("creates an admin user and an invite", async () => {
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
      const loginRes = await client.api.v1.auth.local.login.$post({
        json: {
          email: "admin@test.com",
          password: "admin123",
        },
      });

      expect(loginRes.status).toBe(200);
      const loginData = await loginRes.json();
      expectTypeOf(loginData).toExtend<LoginResponse | ErrorResponse>();
      if (!("success" in loginData)) {
        throw new Error("Expected response to contain 'success'");
      }
      expect(loginData.success).toBe(true);

      // Extract JWT from Set-Cookie header
      const setCookieHeader = loginRes.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      const tokenMatch = setCookieHeader!.match(/access_token=([^;]+)/);
      expect(tokenMatch).toBeDefined();
      const token = tokenMatch![1];

      // Create invite
      const inviteRes = await client.api.v1.admin.invites.$post(
        {
          json: {
            email: "user@test.com",
            role: "operator",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(inviteRes.status).toBe(201);
      const inviteData = await inviteRes.json();
      expectTypeOf(inviteData).toExtend<CreateInviteResponse | ErrorResponse>();
      if (!("success" in inviteData)) {
        throw new Error("Expected response to contain 'success'");
      }
      expect(inviteData.success).toBe(true);
      expect(inviteData.invite.email).toBe("user@test.com");
    });

    test("validates an invite token", async () => {
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
      const res = await client.api.v1.invites.validate.$get({
        query: { token },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<ValidateInviteResponse | ErrorResponse>();
      if (!("valid" in data)) {
        throw new Error("Expected response to contain 'valid'");
      }
      expect(data.valid).toBe(true);
      expect(data.email).toBe("user@test.com");
    });
  });

  describe("local password auth", () => {
    test("sets up password for invited user", async () => {
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
      const res = await client.api.v1.auth.local.setup.$post({
        json: {
          inviteToken: token,
          password: "password123",
          name: "Test User",
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<SetupResponse | ErrorResponse>();
      if (!("success" in data)) {
        throw new Error("Expected response to contain 'success'");
      }
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

    test("logs in with valid credentials", async () => {
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
      const res = await client.api.v1.auth.local.login.$post({
        json: {
          email: "user@test.com",
          password: "password123",
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<LoginResponse | ErrorResponse>();
      if (!("success" in data)) {
        throw new Error("Expected response to contain 'success'");
      }
      expect(data.success).toBe(true);
      expect(data.user.email).toBe("user@test.com");

      // Check cookie was set
      const setCookieHeader = res.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain("access_token=");
    });

    test("rejects login with invalid credentials", async () => {
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
      const res = await client.api.v1.auth.local.login.$post({
        json: {
          email: "user@test.com",
          password: "wrongpassword",
        },
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      if (!("error" in data)) {
        throw new Error("Expected response to contain 'error'");
      }
      expect(data.error).toBeDefined();
    });
  });

  describe("protected routes", () => {
    test("accesses protected route with valid token", async () => {
      // Create user and login
      await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      const loginRes = await client.api.v1.auth.local.login.$post({
        json: {
          email: "user@test.com",
          password: "password123",
        },
      });

      const setCookieHeader = loginRes.headers.get("set-cookie");
      const tokenMatch = setCookieHeader!.match(/access_token=([^;]+)/);
      const token = tokenMatch![1];

      // Access protected route
      const res = await client.api.v1.auth.me.$get(undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<MeResponse | ErrorResponse>();
      if (!("user" in data)) {
        throw new Error("Expected response to contain 'user'");
      }
      expect(data.user.email).toBe("user@test.com");
    });

    test("rejects access without token", async () => {
      const res = await client.api.v1.auth.me.$get();
      expect(res.status).toBe(401);
    });

    test("updates the preferred language via PATCH /auth/me/language", async () => {
      await User.create({
        email: "lang@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      const loginRes = await client.api.v1.auth.local.login.$post({
        json: { email: "lang@test.com", password: "password123" },
      });
      const setCookieHeader = loginRes.headers.get("set-cookie");
      const tokenMatch = setCookieHeader!.match(/access_token=([^;]+)/);
      const token = tokenMatch![1];
      const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

      const meBefore = await client.api.v1.auth.me.$get(undefined, authHeaders);
      const beforeData = await meBefore.json();
      expect(beforeData.user.language).toBeUndefined();

      const res = await client.api.v1.auth.me.language.$patch(
        { json: { language: "it" } },
        authHeaders,
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      if (!("user" in data)) {
        throw new Error("Expected response to contain 'user'");
      }
      expect(data.user.language).toBe("it");

      const persisted = await User.findOne({ email: "lang@test.com" });
      expect(persisted!.language).toBe("it");

      const invalid = await client.api.v1.auth.me.language.$patch(
        // @ts-expect-error unsupported locale must be rejected by validation
        { json: { language: "fr" } },
        authHeaders,
      );
      expect(invalid.status).toBe(400);
    });

    test("rejects operator from admin routes", async () => {
      // Create operator user
      await User.create({
        email: "operator@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      const loginRes = await client.api.v1.auth.local.login.$post({
        json: {
          email: "operator@test.com",
          password: "password123",
        },
      });

      const setCookieHeader = loginRes.headers.get("set-cookie");
      const tokenMatch = setCookieHeader!.match(/access_token=([^;]+)/);
      const token = tokenMatch![1];

      // Try to access admin route
      const res = await client.api.v1.admin.invites.$get(undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expectTypeOf(data).toExtend<ListInvitesResponse | ErrorResponse>();
      if (!("error" in data)) {
        throw new Error("Expected response to contain 'error'");
      }
      expect(data.error).toBeDefined();
    });
  });

  describe("logout and test email", () => {
    test("logs out and clears the access token cookie", async () => {
      await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      const res = await client.api.v1.auth.logout.$post();

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<LogoutResponse | ErrorResponse>();
      if (!("success" in data)) {
        throw new Error("Expected response to contain 'success'");
      }
      expect(data.success).toBe(true);

      const setCookieHeader = res.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain("access_token=");
    });

    test("sends test email as admin", async () => {
      await User.create({
        email: "admin@test.com",
        role: "admin",
        isDisabled: false,
        passwordHash: await Bun.password.hash("admin123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      const loginRes = await client.api.v1.auth.local.login.$post({
        json: {
          email: "admin@test.com",
          password: "admin123",
        },
      });

      const tokenMatch = loginRes.headers
        .get("set-cookie")!
        .match(/access_token=([^;]+)/);
      const token = tokenMatch![1];

      const res = await client.api.v1.auth.admin["test-email"].$post(
        {
          json: { to: "test@test.com" },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<TestEmailResponse | ErrorResponse>();
      if (!("success" in data)) {
        throw new Error("Expected response to contain 'success'");
      }
      expect(data.success).toBe(true);
    });
  });

  describe("password reset flow", () => {
    test("requests password reset for existing user", async () => {
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
      const res = await client.api.v1.auth.local["forgot-password"].$post({
        json: { email: "user@test.com" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<ForgotPasswordResponse | ErrorResponse>();
      if (!("success" in data)) {
        throw new Error("Expected response to contain 'success'");
      }
      expect(data.success).toBe(true);

      // Verify reset token was created
      const user = await User.findOne({ email: "user@test.com" });
      const resetToken = await PasswordResetToken.findOne({ userId: user!._id });
      expect(resetToken).toBeDefined();
    });

    test("completes full password reset flow", async () => {
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
      const validateRes = await client.api.v1.auth.local["validate-reset-token"].$get({
        query: { token },
      });
      expect(validateRes.status).toBe(200);
      const validateData = await validateRes.json();
      expectTypeOf(validateData).toExtend<ValidateResetTokenResponse | ErrorResponse>();

      // Reset password
      const resetRes = await client.api.v1.auth.local["reset-password"].$post({
        json: {
          token,
          password: "newpassword123",
        },
      });

      expect(resetRes.status).toBe(200);
      const resetData = await resetRes.json();
      expectTypeOf(resetData).toExtend<ResetPasswordResponse | ErrorResponse>();
      if (!("success" in resetData)) {
        throw new Error("Expected response to contain 'success'");
      }
      expect(resetData.success).toBe(true);

      // Verify token was deleted
      const deletedToken = await PasswordResetToken.findOne({ tokenHash });
      expect(deletedToken).toBeNull();

      // Login with new password
      const loginRes = await client.api.v1.auth.local.login.$post({
        json: {
          email: "user@test.com",
          password: "newpassword123",
        },
      });

      expect(loginRes.status).toBe(200);

      // Verify old password doesn't work
      const oldLoginRes = await client.api.v1.auth.local.login.$post({
        json: {
          email: "user@test.com",
          password: "oldpassword",
        },
      });

      expect(oldLoginRes.status).toBe(401);
    });

    test("rejects expired reset token", async () => {
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
      const res = await client.api.v1.auth.local["reset-password"].$post({
        json: {
          token,
          password: "newpassword123",
        },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      if (!("error" in data)) {
        throw new Error("Expected response to contain 'error'");
      }
      expect(data.error).toContain("expired");
    });
  });
});
