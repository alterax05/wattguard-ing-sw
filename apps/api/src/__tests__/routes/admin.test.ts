/**
 * Integration tests for admin routes
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
import { ErrorSchema } from "@wattguard/shared";
import type {
  CreateInviteResponse,
  ListInvitesResponse,
  RevokeInviteResponse,
  UpdateUserResponse,
} from "@wattguard/shared";

type ErrorResponse = z.infer<typeof ErrorSchema>;

const client = testClient(app);

// Mock email functions
await mock.module("../../email/mailer", () => ({
  sendInviteEmail: mock(async () => Promise.resolve()),
  sendPasswordResetEmail: mock(async () => Promise.resolve()),
  sendEmail: mock(async () => Promise.resolve()),
  sendTestEmail: mock(async () => Promise.resolve()),
  sendAlertEmail: mock(async () => Promise.resolve()),
}));

// Suppress console logs during tests

setupIntegrationTests();


beforeEach(async () => {
});

// Helper function to create admin user and get token
async function getAdminToken() {
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

  const setCookieHeader = loginRes.headers.get("set-cookie");
  const tokenMatch = setCookieHeader!.match(/access_token=([^;]+)/);
  return tokenMatch![1];
}

// Helper function to create operator user and get token
async function getOperatorToken() {
  await User.create({
    email: "operator@test.com",
    role: "operator",
    isDisabled: false,
    passwordHash: await Bun.password.hash("operator123", {
      algorithm: "bcrypt",
      cost: 10,
    }),
  });

  const loginRes = await client.api.v1.auth.local.login.$post({
    json: {
      email: "operator@test.com",
      password: "operator123",
    },
  });

  const setCookieHeader = loginRes.headers.get("set-cookie");
  const tokenMatch = setCookieHeader!.match(/access_token=([^;]+)/);
  return tokenMatch![1];
}

describe("admin api", () => {
  describe("POST /api/v1/admin/invites", () => {
    test("creates invite with valid data", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.admin.invites.$post(
        {
          json: {
            email: "newuser@test.com",
            role: "operator",
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
      if (!("invite" in data)) {
        throw new Error("Expected response to contain 'invite'");
      }
      expect(data.success).toBe(true);
      expect(data.invite.email).toBe("newuser@test.com");
      expect(data.invite.role).toBe("operator");
      expect(data.invite.status).toBe("pending");
    });

    test("normalizes email on invite creation", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.admin.invites.$post(
        {
          json: {
            email: "NEWUSER@TEST.COM",
            role: "operator",
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
      if (!("invite" in data)) {
        throw new Error("Expected response to contain 'invite'");
      }
      expect(data.invite.email).toBe("newuser@test.com");
    });

    test("rejects invalid email format", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.admin.invites.$post(
        {
          json: {
            email: "not-an-email",
            role: "operator",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      if (!("error" in data)) {
        throw new Error("Expected response to contain 'error'");
      }
      const errorText = Array.isArray(data.error) ? JSON.stringify(data.error) : data.error;
      expect(errorText).toContain("email");
    });

    test("rejects invalid role", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.admin.invites.$post(
        {
          json: {
            email: "newuser@test.com",
            // @ts-expect-error intentionally invalid role
            role: "superadmin",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      if (!("error" in data)) {
        throw new Error("Expected response to contain 'error'");
      }
      expect(data.error).toBeDefined();
    });

    test("rejects missing email field", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.admin.invites.$post(
        {
          // @ts-expect-error intentionally missing required email field
          json: {
            role: "operator",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      if (!("error" in data)) {
        throw new Error("Expected response to contain 'error'");
      }
      expect(data.error).toBeDefined();
    });

    test("rejects missing role field", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.admin.invites.$post(
        {
          // @ts-expect-error intentionally missing required role field
          json: {
            email: "newuser@test.com",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      if (!("error" in data)) {
        throw new Error("Expected response to contain 'error'");
      }
      expect(data.error).toBeDefined();
    });

    test("rejects operator from creating invites", async () => {
      const token = await getOperatorToken();

      const res = await client.api.v1.admin.invites.$post(
        {
          json: {
            email: "newuser@test.com",
            role: "operator",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // SAFETY: res.status is the actual numeric HTTP status code returned by the endpoint.
      expect(res.status as number).toBe(403);
    });

    test("rejects unauthenticated requests", async () => {
      const res = await client.api.v1.admin.invites.$post({
        json: {
          email: "newuser@test.com",
          role: "operator",
        },
      });

      // SAFETY: res.status is the actual numeric HTTP status code returned by the endpoint.
      expect(res.status as number).toBe(401);
    });
  });

  describe("GET /api/v1/admin/invites", () => {
    test("lists all invites", async () => {
      const token = await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });

      // Create some invites
      await Invite.create([
        {
          email: "user1@test.com",
          role: "operator",
          tokenHash: "hash1",
          status: "pending",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdBy: admin!._id,
        },
        {
          email: "user2@test.com",
          role: "admin",
          tokenHash: "hash2",
          status: "accepted",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdBy: admin!._id,
        },
      ]);

      const res = await client.api.v1.admin.invites.$get(undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<ListInvitesResponse | ErrorResponse>();
      if (!("invites" in data)) {
        throw new Error("Expected response to contain 'invites'");
      }
      expect(data.invites).toBeArrayOfSize(2);
      expect(data.invites[0]!.email).toBeDefined();
      expect(data.invites[0]!.role).toBeDefined();
      expect(data.invites[0]!.status).toBeDefined();
    });

    test("returns empty array when no invites exist", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.admin.invites.$get(undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<ListInvitesResponse | ErrorResponse>();
      if (!("invites" in data)) {
        throw new Error("Expected response to contain 'invites'");
      }
      expect(data.invites).toBeArrayOfSize(0);
    });

    test("rejects operator from listing invites", async () => {
      const token = await getOperatorToken();

      const res = await client.api.v1.admin.invites.$get(undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });

    test("rejects unauthenticated requests", async () => {
      const res = await client.api.v1.admin.invites.$get();
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/admin/invites/:id/revoke", () => {
    test("revokes pending invite", async () => {
      const token = await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });

      const invite = await Invite.create({
        email: "user@test.com",
        role: "operator",
        tokenHash: "hash123",
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: admin!._id,
      });

      const res = await client.api.v1.admin.invites[":id"].revoke.$post(
        {
          param: { id: invite._id.toString() },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<RevokeInviteResponse | ErrorResponse>();
      if (!("invite" in data)) {
        throw new Error("Expected response to contain 'invite'");
      }
      expect(data.success).toBe(true);
      expect(data.invite.status).toBe("revoked");

      // Verify in database
      const revokedInvite = await Invite.findById(invite._id);
      expect(revokedInvite!.status).toBe("revoked");
    });

    test("rejects revoking non-existent invite", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.admin.invites[":id"].revoke.$post(
        {
          param: { id: "507f1f77bcf86cd799439011" },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      expect(res.status).toBe(404);
    });

    test("handles invalid invite ID format gracefully", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.admin.invites[":id"].revoke.$post(
        {
          param: { id: "invalid-id" },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // May return 400 (validation) or 500 (mongoose cast error)
      expect([400, 500]).toContain(res.status);
    });

    test("rejects operator from revoking invites", async () => {
      const operatorToken = await getOperatorToken();
      const adminToken = await getAdminToken();

      // Create an invite using admin token
      const createRes = await client.api.v1.admin.invites.$post(
        {
          json: {
            email: "testrevoke@test.com",
            role: "operator",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      const createData = await createRes.json();
      if (!("invite" in createData)) {
        throw new Error("Expected invite to be created");
      }
      const inviteId = createData.invite.id;

      // Try to revoke with operator token
      const res = await client.api.v1.admin.invites[":id"].revoke.$post(
        {
          param: { id: inviteId },
        },
        {
          headers: { Authorization: `Bearer ${operatorToken}` },
        }
      );

      expect(res.status).toBe(403);
    });

    test("rejects unauthenticated requests", async () => {
      const res = await client.api.v1.admin.invites[":id"].revoke.$post({
        param: { id: "507f1f77bcf86cd799439011" },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/v1/admin/users/:id", () => {
    test("updates user role", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      const res = await client.api.v1.admin.users[":id"].$patch(
        {
          param: { id: operator!._id.toString() },
          json: { role: "admin" },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<UpdateUserResponse | ErrorResponse>();
      if (!("user" in data)) {
        throw new Error("Expected response to contain 'user'");
      }
      expect(data.success).toBe(true);
      expect(data.user.role).toBe("admin");
      expect(data.user.isDisabled).toBe(false);

      const updated = await User.findById(operator!._id);
      expect(updated!.role).toBe("admin");
      expect(updated!.isDisabled).toBe(false);
    });

    test("disables a user", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      const res = await client.api.v1.admin.users[":id"].$patch(
        {
          param: { id: operator!._id.toString() },
          json: { isDisabled: true },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<UpdateUserResponse | ErrorResponse>();
      if (!("user" in data)) {
        throw new Error("Expected response to contain 'user'");
      }
      expect(data.success).toBe(true);
      expect(data.user.isDisabled).toBe(true);
      expect(data.user.role).toBe("operator");

      const updated = await User.findById(operator!._id);
      expect(updated!.isDisabled).toBe(true);
    });

    test("re-enables a disabled user", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });
      operator!.isDisabled = true;
      await operator!.save();

      const res = await client.api.v1.admin.users[":id"].$patch(
        {
          param: { id: operator!._id.toString() },
          json: { isDisabled: false },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<UpdateUserResponse | ErrorResponse>();
      if (!("user" in data)) {
        throw new Error("Expected response to contain 'user'");
      }
      expect(data.success).toBe(true);
      expect(data.user.isDisabled).toBe(false);

      const updated = await User.findById(operator!._id);
      expect(updated!.isDisabled).toBe(false);
    });

    test("updates role and status together", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      const res = await client.api.v1.admin.users[":id"].$patch(
        {
          param: { id: operator!._id.toString() },
          json: { role: "admin", isDisabled: true },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<UpdateUserResponse | ErrorResponse>();
      if (!("user" in data)) {
        throw new Error("Expected response to contain 'user'");
      }
      expect(data.user.role).toBe("admin");
      expect(data.user.isDisabled).toBe(true);
    });

    test("rejects empty update body", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      const res = await client.api.v1.admin.users[":id"].$patch(
        {
          param: { id: operator!._id.toString() },
          json: {},
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(400);
    });

    test("rejects updating your own account", async () => {
      const token = await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });

      const res = await client.api.v1.admin.users[":id"].$patch(
        {
          param: { id: admin!._id.toString() },
          json: { isDisabled: true },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(400);
    });

    test("returns 404 for non-existent user", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.admin.users[":id"].$patch(
        {
          param: { id: "507f1f77bcf86cd799439011" },
          json: { isDisabled: true },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    test("rejects invalid role", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      const res = await client.api.v1.admin.users[":id"].$patch(
        {
          param: { id: operator!._id.toString() },
          json: {
            // @ts-expect-error intentionally invalid role
            role: "superadmin",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(400);
    });

    test("rejects operator from updating users", async () => {
      const operatorToken = await getOperatorToken();
      await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });

      const res = await client.api.v1.admin.users[":id"].$patch(
        {
          param: { id: admin!._id.toString() },
          json: { isDisabled: true },
        },
        {
          headers: {
            Authorization: `Bearer ${operatorToken}`,
          },
        }
      );

      expect(res.status).toBe(403);
    });

    test("rejects unauthenticated requests", async () => {
      const res = await client.api.v1.admin.users[":id"].$patch({
        param: { id: "507f1f77bcf86cd799439011" },
        json: { isDisabled: true },
      });

      expect(res.status).toBe(401);
    });

    test("prevents a disabled user from logging in", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      await client.api.v1.admin.users[":id"].$patch(
        {
          param: { id: operator!._id.toString() },
          json: { isDisabled: true },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const loginRes = await client.api.v1.auth.local.login.$post({
        json: {
          email: "operator@test.com",
          password: "operator123",
        },
      });

      expect(loginRes.status).toBe(403);
    });
  });
});
