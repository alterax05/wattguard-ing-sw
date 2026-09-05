/**
 * Integration tests for Building Types routes
 * 
 * Tests the CRUD operations for building types:
 * - GET /api/building-types - List all building types (admin + operator)
 * - POST /api/building-types - Create new building type (admin only)
 * - PATCH /api/building-types/:id - Update building type (admin only)
 * - DELETE /api/building-types/:id - Delete building type (admin only)
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  expectTypeOf,
} from "bun:test";

import { testClient } from "hono/testing";
import { z } from "zod";
import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";
import { ErrorSchema } from "@wattguard/shared";
import type {
  ListBuildingTypesResponse,
  CreateBuildingTypeResponse,
  UpdateBuildingTypeResponse,
  DeleteBuildingTypeResponse,
} from "@wattguard/shared";

type ErrorResponse = z.infer<typeof ErrorSchema>;

const client = testClient(app);
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";

// Suppress console logs during tests

let adminToken: string;
let operatorToken: string;
let adminUserId: string;

setupIntegrationTests();

beforeEach(async () => {

  // Create test users (admin and operator)
  const adminPasswordHash = await Bun.password.hash("admin123", {
    algorithm: "bcrypt",
    cost: 10,
  });

  const admin = await User.create({
    email: "admin@test.com",
    role: "admin",
    passwordHash: adminPasswordHash,
  });
  adminUserId = admin._id.toString();

  const operatorPasswordHash = await Bun.password.hash("operator123", {
    algorithm: "bcrypt",
    cost: 10,
  });

  await User.create({
    email: "operator@test.com",
    role: "operator",
    passwordHash: operatorPasswordHash,
  });

  // Login to get tokens
  const adminLoginRes = await client.api.v1.auth.local.login.$post({
    json: {
      email: "admin@test.com",
      password: "admin123",
    },
  });
  
  const adminCookie = adminLoginRes.headers.get("set-cookie");
  const adminTokenMatch = adminCookie?.match(/access_token=([^;]+)/);
  adminToken = adminTokenMatch?.[1] ?? "";

  const operatorLoginRes = await client.api.v1.auth.local.login.$post({
    json: {
      email: "operator@test.com",
      password: "operator123",
    },
  });
  
  const operatorCookie = operatorLoginRes.headers.get("set-cookie");
  const operatorTokenMatch = operatorCookie?.match(/access_token=([^;]+)/);
  operatorToken = operatorTokenMatch?.[1] ?? "";
});

describe("building-types api", () => {
  // ============================================================================
  // GET /api/building-types - List Building Types
  // ============================================================================

  describe("GET /api/v1/building-types", () => {
    test("returns empty array when no building types exist", async () => {
      const res = await client.api.v1["building-types"].$get(undefined, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<ListBuildingTypesResponse | ErrorResponse>();
      expect(json.success).toBe(true);
      if (!json.success) {
        throw new Error("Expected response success to be true");
      }
      expect(json.data).toEqual([]);
    });

    test("lists all building types (admin)", async () => {
      // Create test building types
      await BuildingType.create([
        { name: "Scuola", description: "Edificio scolastico" },
        { name: "Ospedale", description: "Struttura sanitaria" },
        { name: "Ufficio", description: "Edificio per uffici" },
      ]);

      const res = await client.api.v1["building-types"].$get(undefined, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<ListBuildingTypesResponse | ErrorResponse>();
      expect(json.success).toBe(true);
      if (!json.success) {
        throw new Error("Expected response success to be true");
      }
      expect(json.data.length).toBe(3);
      expect(json.data[0]!.name).toBeDefined();
      expect(json.data[0]!.description).toBeDefined();
      expect(json.data[0]!._id).toBeDefined();
      expect(json.data[0]!.createdAt).toBeDefined();
      expect(json.data[0]!.updatedAt).toBeDefined();
    });

    test("lists all building types (operator)", async () => {
      await BuildingType.create([
        { name: "Scuola", description: "Edificio scolastico" },
      ]);

      const res = await client.api.v1["building-types"].$get(undefined, {
        headers: { Authorization: `Bearer ${operatorToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      if (!json.success) {
        throw new Error("Expected response success to be true");
      }
      expect(json.data.length).toBe(1);
    });

    test("rejects request without token (401)", async () => {
      const res = await client.api.v1["building-types"].$get();

      // SAFETY: res.status is the actual numeric HTTP status code returned by the endpoint.
      expect(res.status as number).toBe(401);
    });

    test("returns building types sorted by name", async () => {
      await BuildingType.create([
        { name: "Ufficio", description: "C" },
        { name: "Scuola", description: "B" },
        { name: "Ospedale", description: "A" },
      ]);

      const res = await client.api.v1["building-types"].$get(undefined, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      if (!json.success) {
        throw new Error("Expected response success to be true");
      }
      expect(json.data[0]!.name).toBe("Ospedale");
      expect(json.data[1]!.name).toBe("Scuola");
      expect(json.data[2]!.name).toBe("Ufficio");
    });
  });

  // ============================================================================
  // POST /api/building-types - Create Building Type
  // ============================================================================

  describe("POST /api/v1/building-types", () => {
    test("creates new building type (admin)", async () => {
      const buildingTypeData = {
        name: "Biblioteca",
        description: "Edificio pubblico per consultazione libri",
      };

      const res = await client.api.v1["building-types"].$post(
        {
          json: buildingTypeData,
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expectTypeOf(json).toExtend<CreateBuildingTypeResponse | ErrorResponse>();
      expect(json.success).toBe(true);
      if (!json.success) {
        throw new Error("Expected response success to be true");
      }
      expect(json.data.name).toBe(buildingTypeData.name);
      expect(json.data.description).toBe(buildingTypeData.description);
      expect(json.data._id).toBeDefined();

      // Verify in database
      const dbBuildingType = await BuildingType.findById(json.data._id);
      expect(dbBuildingType).toBeDefined();
      expect(dbBuildingType!.name).toBe(buildingTypeData.name);
    });

    test("rejects duplicate name", async () => {
      await BuildingType.create({
        name: "Scuola",
        description: "Existing",
      });

      const res = await client.api.v1["building-types"].$post(
        {
          json: {
            name: "Scuola",
            description: "Duplicate",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      if (json.success) {
        throw new Error("Expected response success to be false");
      }
      expect(json.error_code).toBe("building_type_name_exists");
    });

    test("rejects invalid data", async () => {
      const res = await client.api.v1["building-types"].$post(
        {
          json: {
            name: "", // Empty name
            description: "Test",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(400);
    });

    test("rejects request from operator (403)", async () => {
      const res = await client.api.v1["building-types"].$post(
        {
          json: {
            name: "Test",
            description: "Test",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${operatorToken}`,
          },
        }
      );

      // SAFETY: res.status is the actual numeric HTTP status code returned by the endpoint.
      expect(res.status as number).toBe(403);
    });
  });

  // ============================================================================
  // PATCH /api/building-types/:id - Update Building Type
  // ============================================================================

  describe("PATCH /api/v1/building-types/:id", () => {
    test("updates building type (admin)", async () => {
      const buildingType = await BuildingType.create({
        name: "Original Name",
        description: "Original Description",
      });

      const updateData = {
        name: "Updated Name",
        description: "Updated Description",
      };

      const res = await client.api.v1["building-types"][":id"].$patch(
        {
          param: { id: buildingType._id.toString() },
          json: updateData,
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<UpdateBuildingTypeResponse | ErrorResponse>();
      expect(json.success).toBe(true);
      if (!json.success) {
        throw new Error("Expected response success to be true");
      }
      expect(json.data.name).toBe(updateData.name);
      expect(json.data.description).toBe(updateData.description);

      // Verify in database
      const updated = await BuildingType.findById(buildingType._id);
      expect(updated!.name).toBe(updateData.name);
    });

    test("updates only name", async () => {
      const buildingType = await BuildingType.create({
        name: "Original",
        description: "Original Description",
      });

      const res = await client.api.v1["building-types"][":id"].$patch(
        {
          param: { id: buildingType._id.toString() },
          json: {
            name: "Updated Name Only",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      if (!json.success) {
        throw new Error("Expected response success to be true");
      }
      expect(json.data.name).toBe("Updated Name Only");
      expect(json.data.description).toBe("Original Description");
    });

    test("updates only description", async () => {
      const buildingType = await BuildingType.create({
        name: "Original Name",
        description: "Original",
      });

      const res = await client.api.v1["building-types"][":id"].$patch(
        {
          param: { id: buildingType._id.toString() },
          json: {
            description: "Updated Description Only",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      if (!json.success) {
        throw new Error("Expected response success to be true");
      }
      expect(json.data.name).toBe("Original Name");
      expect(json.data.description).toBe("Updated Description Only");
    });

    test("rejects duplicate name", async () => {
      await BuildingType.create({
        name: "Existing",
        description: "Test",
      });

      const buildingType = await BuildingType.create({
        name: "To Update",
        description: "Test",
      });

      const res = await client.api.v1["building-types"][":id"].$patch(
        {
          param: { id: buildingType._id.toString() },
          json: {
            name: "Existing",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      if (json.success) {
        throw new Error("Expected response success to be false");
      }
      expect(json.error_code).toBe("building_type_name_exists");
    });

    test("returns 404 for non-existent building type", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await client.api.v1["building-types"][":id"].$patch(
        {
          param: { id: fakeId },
          json: {
            name: "Test",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    test("rejects request from operator (403)", async () => {
      const buildingType = await BuildingType.create({
        name: "Test",
        description: "Test",
      });

      const res = await client.api.v1["building-types"][":id"].$patch(
        {
          param: { id: buildingType._id.toString() },
          json: {
            name: "Updated",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${operatorToken}`,
          },
        }
      );

      // SAFETY: res.status is the actual numeric HTTP status code returned by the endpoint.
      expect(res.status as number).toBe(403);
    });
  });

  // ============================================================================
  // DELETE /api/building-types/:id - Delete Building Type
  // ============================================================================

  describe("DELETE /api/v1/building-types/:id", () => {
    test("deletes building type (admin)", async () => {
      const buildingType = await BuildingType.create({
        name: "To Delete",
        description: "This will be deleted",
      });

      const res = await client.api.v1["building-types"][":id"].$delete(
        {
          param: { id: buildingType._id.toString() },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<DeleteBuildingTypeResponse | ErrorResponse>();
      expect(json.success).toBe(true);
      if (!json.success) {
        throw new Error("Expected response success to be true");
      }
      expect(json.data.message).toContain("deleted successfully");

      // Verify deletion in database
      const deleted = await BuildingType.findById(buildingType._id);
      expect(deleted).toBeNull();
    });

    test("prevents deletion if building type is in use", async () => {
      const buildingType = await BuildingType.create({
        name: "In Use",
        description: "Used by buildings",
      });

      // Create a building using this type
      await Building.create({
        name: "Test Building",
        address: "Via Test 1",
        geographicZone: "Centro",
        buildingType: buildingType._id,
        surface: 1000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await client.api.v1["building-types"][":id"].$delete(
        {
          param: { id: buildingType._id.toString() },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      if (json.success) {
        throw new Error("Expected response success to be false");
      }
      expect(json.error_code).toBe("building_type_in_use");

      // Verify building type still exists
      const stillExists = await BuildingType.findById(buildingType._id);
      expect(stillExists).toBeDefined();
    });

    test("returns 404 for non-existent building type", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await client.api.v1["building-types"][":id"].$delete(
        {
          param: { id: fakeId },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    test("rejects request from operator (403)", async () => {
      const buildingType = await BuildingType.create({
        name: "Test",
        description: "Test",
      });

      const res = await client.api.v1["building-types"][":id"].$delete(
        {
          param: { id: buildingType._id.toString() },
        },
        {
          headers: {
            Authorization: `Bearer ${operatorToken}`,
          },
        }
      );

      // SAFETY: res.status is the actual numeric HTTP status code returned by the endpoint.
      expect(res.status as number).toBe(403);
    });
  });
});
