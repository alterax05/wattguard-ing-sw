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
import { z } from "zod";
import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";
import { User } from "../../models/User";
import { ErrorSchema } from "@wattguard/shared";
import type {
  DeleteUserResponse,
  ListUsersResponse,
  UpdateUserResponse,
} from "@wattguard/shared";

type ErrorResponse = z.infer<typeof ErrorSchema>;

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
        throw new Error("Expected response success to be true");
      }
      expect(data.data.length).toBe(2);
      expect(data.data.some((u) => u.email === "admin@test.com")).toBe(true);
      expect(data.data.some((u) => u.email === "operator@test.com")).toBe(true);
    });

    test("rejects non-admin users", async () => {
      await getAdminToken();
      const operatorToken = await getOperatorToken();

      const res = await client.api.v1.users.$get(
        {},
        {
          headers: {
            Authorization: `Bearer ${operatorToken}`,
          },
        },
      );

      expect(res.status).toBe(403);
    });

    test("rejects unauthenticated requests", async () => {
      const res = await client.api.v1.users.$get();
      expect(res.status).toBe(401);
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
      expectTypeOf(data).toExtend<UpdateUserResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        throw new Error("Expected response success to be true");
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
      expectTypeOf(data).toExtend<UpdateUserResponse | ErrorResponse>();
      expect(data.success).toBe(true);
      if (!data.success) {
        throw new Error("Expected response success to be true");
      }
      expect(data.data.isDisabled).toBe(true);
      expect(data.data.role).toBe("operator");

      const updated = await User.findById(operator!._id);
      expect(updated!.isDisabled).toBe(true);
    });

    test("re-enables a disabled user", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });
      operator!.isDisabled = true;
      await operator!.save();

      const res = await client.api.v1.users[":id"].$patch(
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
      expect(data.success).toBe(true);
      if (!data.success) {
        throw new Error("Expected response success to be true");
      }
      expect(data.data.isDisabled).toBe(false);

      const updated = await User.findById(operator!._id);
      expect(updated!.isDisabled).toBe(false);
    });

    test("updates role and status together", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      const res = await client.api.v1.users[":id"].$patch(
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
      expect(data.success).toBe(true);
      if (!data.success) {
        throw new Error("Expected response success to be true");
      }
      expect(data.data.role).toBe("admin");
      expect(data.data.isDisabled).toBe(true);
    });

    test("rejects empty update body", async () => {
      const token = await getAdminToken();
      await getOperatorToken();
      const operator = await User.findOne({ email: "operator@test.com" });

      const res = await client.api.v1.users[":id"].$patch(
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

      expect(res.status).toBe(400);
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

    test("rejects operator from updating users", async () => {
      const operatorToken = await getOperatorToken();
      await getAdminToken();
      const admin = await User.findOne({ email: "admin@test.com" });

      const res = await client.api.v1.users[":id"].$patch(
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
      const res = await client.api.v1.users[":id"].$patch({
        param: { id: "507f1f77bcf86cd799439011" },
        json: { isDisabled: true },
      });

      expect(res.status).toBe(401);
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

      const loginRes = await client.api.v1.auth.local.login.$post({
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

      expect(res.status).toBe(200);
      const data = await res.json();
      expectTypeOf(data).toExtend<DeleteUserResponse | ErrorResponse>();
      if (!("success" in data)) {
        throw new Error("Expected response to contain 'success'");
      }
      expect(data.success).toBe(true);

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

      expect(res.status).toBe(400);
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
