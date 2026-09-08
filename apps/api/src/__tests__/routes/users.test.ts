/**
 * Integration tests for user management routes
 */
import {
  describe,
  test,
  expect,
  expectTypeOf,
} from "bun:test";

import { testClient } from "hono/testing";
import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";
import { User } from "../../models/User";
import type {
  ListUsersResponse,
  UserResponse, ErrorResponse} from "@wattguard/shared";



const client = testClient(app);

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

describe("users api", () => {
  describe("GET /api/v1/users", () => {
    test("returns all users for admin", async () => {
      const token = await getAdminToken();
      await getOperatorToken();

      const res = await client.api.v1.users.$get(
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<ListUsersResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected response success to be true");
      }
      expect(data.data.length).toBe(2);
      expect(data.data.some((u) => u.email === "admin@test.com")).toBe(true);
      expect(data.data.some((u) => u.email === "operator@test.com")).toBe(true);
    });

  });

  describe("GET /api/v1/users/:id", () => {
    test("returns user details for admin with self link", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      const res = await client.api.v1.users[":id"].$get(
        {
          param: { id: operator!._id.toString() },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<UserResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected success");
      }
      expect(data.data.email).toBe("operator@test.com");
      expect(data.data.role).toBe("operator");
      expect(data.data.self).toBe(`/api/v1/users/${operator!._id.toString()}`);
    });

    test("returns 404 for non-existent user", async () => {
      const token = await getAdminToken();
      const res = await client.api.v1.users[":id"].$get(
        {
          param: { id: "507f1f77bcf86cd799439011" },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/users/:id", () => {
    test("updates user role", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      const res = await client.api.v1.users[":id"].$patch(
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
      expectTypeOf(data).toExtend<UserResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected response success to be true");
      }
      expect(data.data.role).toBe("admin");
      expect(data.data.isDisabled).toBe(false);

      const updated = await User.findById(operator!._id);
      expect(updated!.role).toBe("admin");
      expect(updated!.isDisabled).toBe(false);
    });

    test("disables a user", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      const res = await client.api.v1.users[":id"].$patch(
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
      expectTypeOf(data).toExtend<UserResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        return expect.unreachable("Expected response success to be true");
      }
      expect(data.data.isDisabled).toBe(true);
      expect(data.data.role).toBe("operator");

      const updated = await User.findById(operator!._id);
      expect(updated!.isDisabled).toBe(true);
    });

    test("rejects updating your own account", async () => {
      const token = await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });

      const res = await client.api.v1.users[":id"].$patch(
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

      expect(res.status).toBe(422);
    });

    test("returns 404 for non-existent user", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.users[":id"].$patch(
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

      const res = await client.api.v1.users[":id"].$patch(
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

    test("prevents a disabled user from logging in", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      await client.api.v1.users[":id"].$patch(
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

      const loginRes = await client.api.v1.auth.session.$post({
        json: {
          email: "operator@test.com",
          password: "operator123",
        },
      });

      expect(loginRes.status).toBe(403);
    });
  });

  describe("DELETE /api/v1/users/:id", () => {
    test("deletes an existing user", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      const res = await client.api.v1.users[":id"].$delete(
        {
          param: { id: operator!._id.toString() },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(204);

      const found = await User.findById(operator!._id);
      expect(found).toBeNull();
    });

    test("rejects deleting your own account", async () => {
      const token = await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });

      const res = await client.api.v1.users[":id"].$delete(
        {
          param: { id: admin!._id.toString() },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(422);
    });

    test("returns 404 for non-existent user", async () => {
      const token = await getAdminToken();

      const res = await client.api.v1.users[":id"].$delete(
        {
          param: { id: "507f1f77bcf86cd799439011" },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });
  });
});
