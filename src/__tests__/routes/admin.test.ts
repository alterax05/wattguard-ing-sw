/**
 * Integration tests for admin routes
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { Invite } from "../../models/Invite";

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

  const loginRes = await app.request("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "operator@test.com",
      password: "operator123",
    }),
  });

  const setCookieHeader = loginRes.headers.get("set-cookie");
  const tokenMatch = setCookieHeader!.match(/access_token=([^;]+)/);
  return tokenMatch![1];
}

describe("Admin Routes", () => {
  describe("POST /api/admin/invites - Create Invite", () => {
    test("should create invite with valid data", async () => {
      const token = await getAdminToken();

      const res = await app.request("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: "newuser@test.com",
          role: "operator",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.invite.email).toBe("newuser@test.com");
      expect(data.invite.role).toBe("operator");
      expect(data.invite.status).toBe("pending");
    });

    test("should normalize email on invite creation", async () => {
      const token = await getAdminToken();

      const res = await app.request("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: "NEWUSER@TEST.COM",
          role: "operator",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.invite.email).toBe("newuser@test.com");
    });

    test("should reject invalid email format", async () => {
      const token = await getAdminToken();

      const res = await app.request("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: "not-an-email",
          role: "operator",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      const errorText = Array.isArray(data.error) ? JSON.stringify(data.error) : data.error;
      expect(errorText).toContain("email");
    });

    test("should reject invalid role", async () => {
      const token = await getAdminToken();

      const res = await app.request("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: "newuser@test.com",
          role: "superadmin",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeTruthy();
    });

    test("should reject missing email field", async () => {
      const token = await getAdminToken();

      const res = await app.request("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role: "operator",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeTruthy();
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
          email: "newuser@test.com",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeTruthy();
    });

    test("should reject operator from creating invites", async () => {
      const token = await getOperatorToken();

      const res = await app.request("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: "newuser@test.com",
          role: "operator",
        }),
      });

      expect(res.status).toBe(403);
    });

    test("should reject unauthenticated requests", async () => {
      const res = await app.request("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "newuser@test.com",
          role: "operator",
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/admin/invites - List Invites", () => {
    test("should list all invites", async () => {
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

      const res = await app.request("/api/admin/invites", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.invites).toBeArrayOfSize(2);
      expect(data.invites[0].email).toBeTruthy();
      expect(data.invites[0].role).toBeTruthy();
      expect(data.invites[0].status).toBeTruthy();
    });

    test("should return empty array when no invites exist", async () => {
      const token = await getAdminToken();

      const res = await app.request("/api/admin/invites", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.invites).toBeArrayOfSize(0);
    });

    test("should reject operator from listing invites", async () => {
      const token = await getOperatorToken();

      const res = await app.request("/api/admin/invites", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });

    test("should reject unauthenticated requests", async () => {
      const res = await app.request("/api/admin/invites");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/admin/invites/:id/revoke - Revoke Invite", () => {
    test("should revoke pending invite", async () => {
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

      const res = await app.request(`/api/admin/invites/${invite._id}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.invite.status).toBe("revoked");

      // Verify in database
      const revokedInvite = await Invite.findById(invite._id);
      expect(revokedInvite!.status).toBe("revoked");
    });

    test("should reject revoking non-existent invite", async () => {
      const token = await getAdminToken();

      const res = await app.request("/api/admin/invites/507f1f77bcf86cd799439011/revoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);
    });

    test("should handle invalid invite ID format gracefully", async () => {
      const token = await getAdminToken();

      const res = await app.request("/api/admin/invites/invalid-id/revoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      // May return 400 (validation) or 500 (mongoose cast error)
      expect([400, 500]).toContain(res.status);
    });

    test("should reject operator from revoking invites", async () => {
      const operatorToken = await getOperatorToken();
      const adminToken = await getAdminToken();
      
      // Create an invite using admin token
      const createRes = await app.request("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          email: "testrevoke@test.com",
          role: "operator",
        }),
      });
      
      const createData = await createRes.json();
      const inviteId = createData.invite.id;

      // Try to revoke with operator token
      const res = await app.request(`/api/admin/invites/${inviteId}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${operatorToken}` },
      });

      expect(res.status).toBe(403);
    });

    test("should reject unauthenticated requests", async () => {
      const res = await app.request("/api/admin/invites/507f1f77bcf86cd799439011/revoke", {
        method: "POST",
      });

      expect(res.status).toBe(401);
    });
  });
});
