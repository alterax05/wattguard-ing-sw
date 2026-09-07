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
import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";
import { expectValidationError } from "../helpers/validation";
import { User } from "../../models/User";
import { Invite } from "../../models/Invite";
import { randomToken, hashTokenSha256 } from "../../utils/crypto";
import type {
  CreateInviteResponse,
  ListInvitesResponse,
  ValidateInviteResponse,
  GetInviteByIdResponse, ErrorResponse} from "@wattguard/shared";



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

  const loginRes = await client.api.v1.auth.session.$post({
    json: {
      email: "admin@test.com",
      password: "admin123",
    },
  });

  // SAFETY: helper seeds the user then logs in with valid credentials, so the body is SessionResponse.
  return ((await loginRes.json()) as { data: { token: string } }).data.token;
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

  const loginRes = await client.api.v1.auth.session.$post({
    json: {
      email: "operator@test.com",
      password: "operator123",
    },
  });

  // SAFETY: helper seeds the user then logs in with valid credentials, so the body is SessionResponse.
  return ((await loginRes.json()) as { data: { token: string } }).data.token;
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
        return expect.unreachable("Expected response success to be true");
      }
      expect(res.headers.get("location")).toBe(`/api/v1/invites/${data.data._id}`);
      expect(data.data.self).toBe(`/api/v1/invites/${data.data._id}`);
      expect(data.data.email).toBe("newuser@test.com");
      expect(data.data.role).toBe("operator");
      expect(data.data.status).toBe("pending");
    });

    test("rejects creating invite if user email already exists (409 Conflict)", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.invites.$post(
        {
          json: {
            email: "admin@test.com", // Already created in getAdminToken
            role: "operator",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);
      if (data.success) {
        return expect.unreachable("Expected error");
      }
      expect(data.error_code).toBe("user_email_exists");
    });

    test("rejects creating invite if pending invite already exists (409 Conflict)", async () => {
      const token = await getAdminToken();

      // First invite
      await client.api.v1.invites.$post(
        {
          json: {
            email: "pending@test.com",
            role: "operator",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Second invite with same email
      const res = await client.api.v1.invites.$post(
        {
          json: {
            email: "pending@test.com",
            role: "admin",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);
      if (data.success) {
        return expect.unreachable("Expected error");
      }
      expect(data.error_code).toBe("invite_pending_exists");
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
        return expect.unreachable("Expected response success to be true");
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

      expectValidationError({ data: await res.json(), status: res.status, fieldName: "email" });
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

      expectValidationError({ data: await res.json(), status: res.status });
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

      expectValidationError({ data: await res.json(), status: res.status });
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

      expectValidationError({ data: await res.json(), status: res.status });
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

      expect(Number(res.status)).toBe(403);
    });

    test("rejects unauthenticated requests", async () => {
      const res = await client.api.v1.invites.$post({
        json: {
          email: "newuser@test.com",
          role: "operator",
        },
      });

      expect(Number(res.status)).toBe(401);
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

      const res = await client.api.v1.invites.$get({
        query: {},
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      // SAFETY: callers supply the documented response schema of the endpoint under test.
      const data = (await res.json()) as ListInvitesResponse | ErrorResponse;
      expectTypeOf(data).toExtend<ListInvitesResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected response success to be true");
      }
      expect(data.data).toBeArrayOfSize(2);
      expect(data.data[0]!.email).toBeDefined();
      expect(data.data[0]!.role).toBeDefined();
      expect(data.data[0]!.status).toBeDefined();
    });

    test("returns empty array when no invites exist", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.invites.$get({
        query: {},
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      // SAFETY: callers supply the documented response schema of the endpoint under test.
      const data = (await res.json()) as ListInvitesResponse | ErrorResponse;
      expectTypeOf(data).toExtend<ListInvitesResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected response success to be true");
      }
      expect(data.data).toBeArrayOfSize(0);
    });

    test("rejects operator from listing invites", async () => {
      const token = await getOperatorToken();

      const res = await client.api.v1.invites.$get({
        query: {},
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });

    test("rejects unauthenticated requests", async () => {
      const res = await client.api.v1.invites.$get({
        query: {},
      });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/v1/invites/:id", () => {
    test("returns full invite details for admin with self link", async () => {
      const token = await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });

      const invite = await Invite.create({
        email: "getbyid@test.com",
        role: "operator",
        tokenHash: "fakehashgetbyid",
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: admin!._id,
      });

      const res = await client.api.v1.invites[":id"].$get(
        {
          param: { id: invite._id.toString() },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<GetInviteByIdResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected success");
      }
      expect(data.data.email).toBe("getbyid@test.com");
      expect(data.data.self).toBe(`/api/v1/invites/${invite._id.toString()}`);
    });

    test("returns 404 for non-existent invite", async () => {
      const token = await getAdminToken();
      const res = await client.api.v1.invites[":id"].$get(
        {
          param: { id: "507f1f77bcf86cd799439011" },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      expect(res.status).toBe(404);
    });

    test("rejects operator from getting invite by id", async () => {
      const token = await getOperatorToken();
      const res = await client.api.v1.invites[":id"].$get(
        {
          param: { id: "507f1f77bcf86cd799439011" },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/v1/invites/:id", () => {
    test("rejects revoking an already revoked invite (409 Conflict)", async () => {
      const token = await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });

      const invite = await Invite.create({
        email: "alreadyrevoked@test.com",
        role: "operator",
        tokenHash: "fakehashalreadyrevoked",
        status: "revoked",
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

      expect(res.status).toBe(409);
      // SAFETY: 409 responses always carry the JSON error envelope.
      const data = (await res.json()) as ErrorResponse;
      expect(data.success).toBe(false);
      if (data.success) {
        return expect.unreachable("Expected error");
      }
      expect(data.error_code).toBe("only_pending_invites_revocable");
    });
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

      expect(res.status).toBe(204);

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

      // Invalid ObjectIds are rejected by param validation (400)
      expect(Number(res.status)).toBe(400);
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
        return expect.unreachable("Expected invite to be created");
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

      expect(Number(res.status)).toBe(403);
    });

    test("rejects unauthenticated requests", async () => {
      const res = await client.api.v1.invites[":id"].$delete({
        param: { id: "507f1f77bcf86cd799439011" },
      });

      expect(Number(res.status)).toBe(401);
    });
  });

  describe("GET /api/v1/invites?token public lookup", () => {
    test("returns invite data for a valid token without auth", async () => {
      await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });
      const rawToken = `lookup-${Date.now()}-${Math.random()}`;
      const invite = await Invite.create({
        email: "lookup@test.com",
        role: "operator",
        tokenHash: hashTokenSha256(rawToken),
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: admin!._id,
      });

      const res = await client.api.v1.invites.$get({
        query: { token: rawToken },
      });

      expect(res.status).toBe(200);
      // SAFETY: callers supply the documented response schema of the endpoint under test.
      const data = (await res.json()) as ValidateInviteResponse | ErrorResponse;
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected success");
      }
      expect(data.data._id).toBe(invite._id.toString());
      expect(data.data.self).toBe(`/api/v1/invites/${invite._id.toString()}`);
    });

    test("returns 404 for unknown token without auth", async () => {
      const res = await client.api.v1.invites.$get({
        query: { token: "does-not-exist" },
      });

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/invites/:id accept", () => {
    test("rejects token bound to a different invite id (404)", async () => {
      await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });
      const tokenA = randomToken(16);
      const inviteA = await Invite.create({
        email: "a@test.com",
        role: "operator",
        tokenHash: hashTokenSha256(tokenA),
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: admin!._id,
      });
      const tokenB = randomToken(16);
      const inviteB = await Invite.create({
        email: "b@test.com",
        role: "operator",
        tokenHash: hashTokenSha256(tokenB),
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: admin!._id,
      });

      const res = await client.api.v1.invites[":id"].$patch({
        param: { id: inviteA._id.toString() },
        json: { token: tokenB, password: "password123", name: "Test User" },
      });

      expect(res.status).toBe(404);
      expect((await Invite.findById(inviteB._id))!.status).toBe("pending");
    });
  });
});
