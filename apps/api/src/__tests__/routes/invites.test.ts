/**
 * Integration tests for invite routes
 */
import {
  describe,
  test,
  expect,
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
  DeleteInviteResponse,
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

setupIntegrationTests();

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

describe("invites api", () => {
  describe("POST /api/v1/invites", () => {
    test("creates invite with valid data", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.invites.$post(
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
      expect(data.success).toBe(true);
      if (!data.success) {
        throw new Error("Expected response success to be true");
      }
      expect(res.headers.get("location")).toBe(`/api/v1/invites/${data.data._id}`);
      expect(data.data.email).toBe("newuser@test.com");
      expect(data.data.role).toBe("operator");
      expect(data.data.status).toBe("pending");
    });

    test("normalizes email on invite creation", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.invites.$post(
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
      expect(data.success).toBe(true);
      if (!data.success) {
        throw new Error("Expected response success to be true");
      }
      expect(data.data.email).toBe("newuser@test.com");
    });

    test("rejects invalid email format", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.invites.$post(
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

      const res = await client.api.v1.invites.$post(
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

      const res = await client.api.v1.invites.$post(
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

      const res = await client.api.v1.invites.$post(
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

      const res = await client.api.v1.invites.$post(
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
      const res = await client.api.v1.invites.$post({
        json: {
          email: "newuser@test.com",
          role: "operator",
        },
      });

      // SAFETY: res.status is the actual numeric HTTP status code returned by the endpoint.
      expect(res.status as number).toBe(401);
    });
  });

  describe("GET /api/v1/invites", () => {
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

      const res = await client.api.v1.invites.$get(undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<ListInvitesResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        throw new Error("Expected response success to be true");
      }
      expect(data.data).toBeArrayOfSize(2);
      expect(data.data[0]!.email).toBeDefined();
      expect(data.data[0]!.role).toBeDefined();
      expect(data.data[0]!.status).toBeDefined();
    });

    test("returns empty array when no invites exist", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.invites.$get(undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<ListInvitesResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        throw new Error("Expected response success to be true");
      }
      expect(data.data).toBeArrayOfSize(0);
    });

    test("rejects operator from listing invites", async () => {
      const token = await getOperatorToken();

      const res = await client.api.v1.invites.$get(undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });

    test("rejects unauthenticated requests", async () => {
      const res = await client.api.v1.invites.$get();
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/v1/invites/:id", () => {
    test("revokes a pending invite", async () => {
      const token = await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });

      const invite = await Invite.create({
        email: "torevoke@test.com",
        role: "operator",
        tokenHash: "fakehash123",
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: admin!._id,
      });

      const res = await client.api.v1.invites[":id"].$delete(
        {
          param: { id: invite._id.toString() },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<DeleteInviteResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        throw new Error("Expected response success to be true");
      }
      expect(data.data.status).toBe("revoked");

      // Verify in database
      const revokedInvite = await Invite.findById(invite._id);
      expect(revokedInvite!.status).toBe("revoked");
    });

    test("rejects revoking non-existent invite", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.invites[":id"].$delete(
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

      const res = await client.api.v1.invites[":id"].$delete(
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
      const createRes = await client.api.v1.invites.$post(
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
      expect(createData.success).toBe(true);
      if (!createData.success) {
        throw new Error("Expected invite to be created");
      }
      const inviteId = createData.data._id;

      // Try to revoke with operator token
      const res = await client.api.v1.invites[":id"].$delete(
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
      const res = await client.api.v1.invites[":id"].$delete({
        param: { id: "507f1f77bcf86cd799439011" },
      });

      expect(res.status).toBe(401);
    });
  });
});
