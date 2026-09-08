/**
 * Integration tests for authentication and session flows
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
import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";
import { User } from "../../models/User";
import { Invite } from "../../models/Invite";
import { randomToken, hashTokenSha256 } from "../../utils/crypto";
import type {
  ValidateInviteResponse,
  AcceptInviteResponse,
  SessionResponse,
  SessionUserResponse,
  GoogleConfigResponse, ErrorResponse} from "@wattguard/shared";



interface MockGooglePayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

let mockPayload: MockGooglePayload = {
  sub: "google-12345",
  email: "googleuser@test.com",
  email_verified: true,
  name: "Google User",
};
let mockVerifyError: Error | null = null;

// Mock google-auth-library
await mock.module("google-auth-library", () => {
  return {
    OAuth2Client: class {
      constructor(public clientId?: string) {}
      verifyIdToken() {
        if (mockVerifyError) {
          return Promise.reject(mockVerifyError);
        }
        return Promise.resolve({
          getPayload: () => mockPayload,
        });
      }
    },
  };
});

// Mock email functions to avoid email requirements in tests
await mock.module("../../email/mailer", () => ({
  sendInviteEmail: mock(async () => Promise.resolve()),
  sendPasswordResetEmail: mock(async () => Promise.resolve()),
  sendEmail: mock(async () => Promise.resolve()),
  sendTestEmail: mock(async () => Promise.resolve()),
  sendAlertEmail: mock(async () => Promise.resolve()),
}));

setupIntegrationTests();

const client = testClient(app);

describe("auth api", () => {
  beforeEach(() => {
    mockVerifyError = null;
    mockPayload = {
      sub: "google-12345",
      email: "googleuser@test.com",
      email_verified: true,
      name: "Google User",
    };
  });

  describe("invite flow", () => {
    test("validates an invite token", async () => {
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

      const res = await client.api.v1.invites.$get({
        query: { token },
      });

      expect(res.status).toBe(200);
      // SAFETY: callers supply the documented response schema of the endpoint under test.
      const data = (await res.json()) as ValidateInviteResponse | ErrorResponse;
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected response success to be true");
      }
      expect(data.data.valid).toBe(true);
      expect(data.data.email).toBe("user@test.com");
      expect(data.data.role).toBe("operator");
    });

    test("completes local setup and activates user account via PATCH /invites/:id", async () => {
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

      const invite = await Invite.create({
        email: "user@test.com",
        role: "operator",
        tokenHash,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: admin._id,
      });

      // Accept invite
      const res = await client.api.v1.invites[":id"].$patch({
        param: { id: invite._id.toString() },
        json: {
          token,
          password: "password123",
          name: "Test User",
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<AcceptInviteResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected response success to be true");
      }
      expect(data.data.user.email).toBe("user@test.com");

      // Verify user was created
      const user = await User.findOne({ email: "user@test.com" });
      expect(user).toBeDefined();
      expect(user!.passwordHash).toBeDefined();

      // Verify invite was marked as accepted
      const acceptedInvite = await Invite.findOne({ tokenHash });
      expect(acceptedInvite!.status).toBe("accepted");
    });

    test("accepts invite via Google ID token via PATCH /invites/:id", async () => {
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

      const invite = await Invite.create({
        email: "googleuser@test.com",
        role: "operator",
        tokenHash,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: admin._id,
      });

      const res = await client.api.v1.invites[":id"].$patch({
        param: { id: invite._id.toString() },
        json: {
          token,
          idToken: "valid-mock-google-token",
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      if (!data.success) return expect.unreachable("Expected success");
      expect(data.data.user.email).toBe("googleuser@test.com");
      expect(data.data.user.name).toBe("Google User");

      const user = await User.findOne({ email: "googleuser@test.com" });
      expect(user).toBeDefined();
      expect(user!.googleSub).toBe("google-12345");

      const acceptedInvite = await Invite.findOne({ tokenHash });
      expect(acceptedInvite!.status).toBe("accepted");
    });
  });

  describe("session management", () => {
    test("logs in with valid local credentials via POST /auth/session", async () => {
      await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      const res = await client.api.v1.auth.session.$post({
        json: {
          email: "user@test.com",
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

      expect(data.data.token.length).toBeGreaterThan(0);
    });

    test("rejects login with invalid credentials", async () => {
      await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      const res = await client.api.v1.auth.session.$post({
        json: {
          email: "user@test.com",
          password: "wrongpassword",
        },
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      if (data.success) {
        return expect.unreachable("Expected response success to be false");
      }
      expect(data.error_code).toBe("invalid_credentials");
    });

    
    test("logs in existing user with valid Google ID token via POST /auth/session", async () => {
      await User.create({
        email: "googleuser@test.com",
        name: "Old Name",
        role: "operator",
        isDisabled: false,
      });

      const res = await client.api.v1.auth.session.$post({
        json: {
          idToken: "valid-mock-token",
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      if (!data.success) return expect.unreachable("Expected success");
      expectTypeOf(data).toExtend<SessionResponse>();
      expect(data.data.user.email).toBe("googleuser@test.com");

      const user = await User.findOne({ email: "googleuser@test.com" });
      expect(user!.googleSub).toBe("google-12345");
      expect(user!.lastLoginAt).toBeDefined();

      expect(data.data.token.length).toBeGreaterThan(0);
    });

    test("rejects Google login when user does not exist", async () => {
      const res = await client.api.v1.auth.session.$post({
        json: {
          idToken: "valid-mock-token",
        },
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      if (data.success) return expect.unreachable("Expected error");
      expect(data.error_code).toBe("oauth_no_account");
    });

    test("rejects Google sign-in when account is disabled", async () => {
      await User.create({
        email: "googleuser@test.com",
        role: "operator",
        isDisabled: true,
      });

      const res = await client.api.v1.auth.session.$post({
        json: {
          idToken: "valid-mock-token",
        },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      if (data.success) return expect.unreachable("Expected error");
      expect(data.error_code).toBe("oauth_account_disabled");
    });

  });

  describe("Google OAuth config", () => {
    test("GET /api/v1/auth/google/config returns configured client ID", async () => {
      const res = await client.api.v1.auth.google.config.$get();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      if (!data.success) return expect.unreachable("Expected success");
      expectTypeOf(data).toExtend<GoogleConfigResponse>();
      expect(data.data.clientId).toBeDefined();
    });
  });

  describe("current session and protected routes", () => {
    test("accesses current session user via GET /auth/session", async () => {
      await User.create({
        email: "user@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      const loginRes = await client.api.v1.auth.session.$post({
        json: {
          email: "user@test.com",
          password: "password123",
        },
      });

      // SAFETY: login with freshly seeded valid credentials returns SessionResponse.
      const token = ((await loginRes.json()) as SessionResponse).data.token;

      const res = await client.api.v1.auth.session.$get(undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<SessionUserResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected response success to be true");
      }
      expect(data.data.email).toBe("user@test.com");
    });

    test("rejects access without token", async () => {
      const res = await client.api.v1.auth.session.$get();
      expect(res.status).toBe(401);
    });

    test("updates user profile via PATCH /auth/session", async () => {
      await User.create({
        email: "lang@test.com",
        role: "operator",
        passwordHash: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
      });

      const loginRes = await client.api.v1.auth.session.$post({
        json: { email: "lang@test.com", password: "password123" },
      });
      // SAFETY: login with freshly seeded valid credentials returns SessionResponse.
      const token = ((await loginRes.json()) as SessionResponse).data.token;
      const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

      const meBefore = await client.api.v1.auth.session.$get(undefined, authHeaders);
      const beforeData = await meBefore.json();
      expect(beforeData.data.language).toBeUndefined();

      const res = await client.api.v1.auth.session.$patch(
        { json: { language: "it", name: "Updated Name" } },
        authHeaders,
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected response success to be true");
      }
      expect(data.data.language).toBe("it");
      expect(data.data.name).toBe("Updated Name");

      const persisted = await User.findOne({ email: "lang@test.com" });
      expect(persisted!.language).toBe("it");
      expect(persisted!.name).toBe("Updated Name");

      const invalid = await client.api.v1.auth.session.$patch(
        // @ts-expect-error unsupported locale must be rejected by validation
        { json: { language: "fr" } },
        authHeaders,
      );
      expect(invalid.status).toBe(400);
    });
  });

});
