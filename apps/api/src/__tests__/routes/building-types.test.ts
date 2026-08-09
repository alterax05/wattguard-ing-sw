/**
 * Integration tests for Building Types routes
 * 
 * Tests the CRUD operations for building types:
 * - GET /api/building-types - List all building types (admin + operator)
 * - POST /api/building-types - Create new building type (admin only)
 * - PATCH /api/building-types/:id - Update building type (admin only)
 * - DELETE /api/building-types/:id - Delete building type (admin only)
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, expectTypeOf } from "bun:test";
import { testClient } from "hono/testing";
import { z } from "zod";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
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
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

let adminToken: string;
let operatorToken: string;
let adminUserId: string;

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
  const adminLoginRes = await app.request("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@test.com",
      password: "admin123",
    }),
  });
  
  const adminCookie = adminLoginRes.headers.get("set-cookie");
  const adminTokenMatch = adminCookie?.match(/access_token=([^;]+)/);
  adminToken = adminTokenMatch?.[1] ?? "";

  const operatorLoginRes = await app.request("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "operator@test.com",
      password: "operator123",
    }),
  });
  
  const operatorCookie = operatorLoginRes.headers.get("set-cookie");
  const operatorTokenMatch = operatorCookie?.match(/access_token=([^;]+)/);
  operatorToken = operatorTokenMatch?.[1] ?? "";
});

describe("Building Types Routes - Integration Tests", () => {
  // ============================================================================
  // GET /api/building-types - List Building Types
  // ============================================================================

  describe("GET /api/building-types", () => {
    test("should return empty array when no building types exist", async () => {
      const res = await client.api["building-types"].$get(undefined, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<ListBuildingTypesResponse | ErrorResponse>();
      if (!("buildingTypes" in json)) {
        throw new Error("Expected response to contain 'buildingTypes'");
      }
      expect(json.buildingTypes).toEqual([]);
    });

    test("should list all building types (admin)", async () => {
      // Create test building types
      await BuildingType.create([
        { name: "Scuola", description: "Edificio scolastico" },
        { name: "Ospedale", description: "Struttura sanitaria" },
        { name: "Ufficio", description: "Edificio per uffici" },
      ]);

      const res = await client.api["building-types"].$get(undefined, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<ListBuildingTypesResponse | ErrorResponse>();
      if (!("buildingTypes" in json)) {
        throw new Error("Expected response to contain 'buildingTypes'");
      }
      expect(json.buildingTypes.length).toBe(3);
      expect(json.buildingTypes[0]!.name).toBeDefined();
      expect(json.buildingTypes[0]!.description).toBeDefined();
      expect(json.buildingTypes[0]!.id).toBeDefined();
      expect(json.buildingTypes[0]!.createdAt).toBeDefined();
      expect(json.buildingTypes[0]!.updatedAt).toBeDefined();
    });

    test("should list all building types (operator)", async () => {
      await BuildingType.create([
        { name: "Scuola", description: "Edificio scolastico" },
      ]);

      const res = await client.api["building-types"].$get(undefined, {
        headers: { Authorization: `Bearer ${operatorToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("buildingTypes" in json)) {
        throw new Error("Expected response to contain 'buildingTypes'");
      }
      expect(json.buildingTypes.length).toBe(1);
    });

    test("should reject request without token (401)", async () => {
      const res = await client.api["building-types"].$get();

      expect(res.status as number).toBe(401);
    });

    test("should return building types sorted by name", async () => {
      await BuildingType.create([
        { name: "Ufficio", description: "C" },
        { name: "Scuola", description: "B" },
        { name: "Ospedale", description: "A" },
      ]);

      const res = await client.api["building-types"].$get(undefined, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("buildingTypes" in json)) {
        throw new Error("Expected response to contain 'buildingTypes'");
      }
      expect(json.buildingTypes[0]!.name).toBe("Ospedale");
      expect(json.buildingTypes[1]!.name).toBe("Scuola");
      expect(json.buildingTypes[2]!.name).toBe("Ufficio");
    });
  });

  // ============================================================================
  // POST /api/building-types - Create Building Type
  // ============================================================================

  describe("POST /api/building-types", () => {
    test("should create new building type (admin)", async () => {
      const buildingTypeData = {
        name: "Biblioteca",
        description: "Edificio pubblico per consultazione libri",
      };

      const res = await client.api["building-types"].$post(
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
      if (!("buildingType" in json)) {
        throw new Error("Expected response to contain 'buildingType'");
      }
      expect(json.success).toBe(true);
      expect(json.buildingType.name).toBe(buildingTypeData.name);
      expect(json.buildingType.description).toBe(buildingTypeData.description);
      expect(json.buildingType.id).toBeDefined();

      // Verify in database
      const dbBuildingType = await BuildingType.findById(json.buildingType.id);
      expect(dbBuildingType).toBeDefined();
      expect(dbBuildingType!.name).toBe(buildingTypeData.name);
    });

    test("should reject duplicate name", async () => {
      await BuildingType.create({
        name: "Scuola",
        description: "Existing",
      });

      const res = await client.api["building-types"].$post(
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
      if (!("error" in json)) {
        throw new Error("Expected response to contain 'error'");
      }
      expect(json.error).toContain("already exists");
    });

    test("should reject invalid data", async () => {
      const res = await client.api["building-types"].$post(
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

    test("should reject request from operator (403)", async () => {
      const res = await client.api["building-types"].$post(
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

      expect(res.status as number).toBe(403);
    });
  });

  // ============================================================================
  // PATCH /api/building-types/:id - Update Building Type
  // ============================================================================

  describe("PATCH /api/building-types/:id", () => {
    test("should update building type (admin)", async () => {
      const buildingType = await BuildingType.create({
        name: "Original Name",
        description: "Original Description",
      });

      const updateData = {
        name: "Updated Name",
        description: "Updated Description",
      };

      const res = await client.api["building-types"][":id"].$patch(
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
      if (!("buildingType" in json)) {
        throw new Error("Expected response to contain 'buildingType'");
      }
      expect(json.success).toBe(true);
      expect(json.buildingType.name).toBe(updateData.name);
      expect(json.buildingType.description).toBe(updateData.description);

      // Verify in database
      const updated = await BuildingType.findById(buildingType._id);
      expect(updated!.name).toBe(updateData.name);
    });

    test("should update only name", async () => {
      const buildingType = await BuildingType.create({
        name: "Original",
        description: "Original Description",
      });

      const res = await client.api["building-types"][":id"].$patch(
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
      if (!("buildingType" in json)) {
        throw new Error("Expected response to contain 'buildingType'");
      }
      expect(json.buildingType.name).toBe("Updated Name Only");
      expect(json.buildingType.description).toBe("Original Description");
    });

    test("should update only description", async () => {
      const buildingType = await BuildingType.create({
        name: "Original Name",
        description: "Original",
      });

      const res = await client.api["building-types"][":id"].$patch(
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
      if (!("buildingType" in json)) {
        throw new Error("Expected response to contain 'buildingType'");
      }
      expect(json.buildingType.name).toBe("Original Name");
      expect(json.buildingType.description).toBe("Updated Description Only");
    });

    test("should reject duplicate name", async () => {
      await BuildingType.create({
        name: "Existing",
        description: "Test",
      });

      const buildingType = await BuildingType.create({
        name: "To Update",
        description: "Test",
      });

      const res = await client.api["building-types"][":id"].$patch(
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
      if (!("error" in json)) {
        throw new Error("Expected response to contain 'error'");
      }
      expect(json.error).toContain("already exists");
    });

    test("should return 404 for non-existent building type", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await client.api["building-types"][":id"].$patch(
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

    test("should reject request from operator (403)", async () => {
      const buildingType = await BuildingType.create({
        name: "Test",
        description: "Test",
      });

      const res = await client.api["building-types"][":id"].$patch(
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

      expect(res.status as number).toBe(403);
    });
  });

  // ============================================================================
  // DELETE /api/building-types/:id - Delete Building Type
  // ============================================================================

  describe("DELETE /api/building-types/:id", () => {
    test("should delete building type (admin)", async () => {
      const buildingType = await BuildingType.create({
        name: "To Delete",
        description: "This will be deleted",
      });

      const res = await client.api["building-types"][":id"].$delete(
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
      if (!("message" in json)) {
        throw new Error("Expected response to contain 'message'");
      }
      expect(json.success).toBe(true);
      expect(json.message).toContain("deleted successfully");

      // Verify deletion in database
      const deleted = await BuildingType.findById(buildingType._id);
      expect(deleted).toBeNull();
    });

    test("should prevent deletion if building type is in use", async () => {
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

      const res = await client.api["building-types"][":id"].$delete(
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
      if (!("error" in json)) {
        throw new Error("Expected response to contain 'error'");
      }
      expect(json.error).toContain("Cannot delete");
      expect(json.error).toContain("building(s) are using it");

      // Verify building type still exists
      const stillExists = await BuildingType.findById(buildingType._id);
      expect(stillExists).toBeDefined();
    });

    test("should return 404 for non-existent building type", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await client.api["building-types"][":id"].$delete(
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

    test("should reject request from operator (403)", async () => {
      const buildingType = await BuildingType.create({
        name: "Test",
        description: "Test",
      });

      const res = await client.api["building-types"][":id"].$delete(
        {
          param: { id: buildingType._id.toString() },
        },
        {
          headers: {
            Authorization: `Bearer ${operatorToken}`,
          },
        }
      );

      expect(res.status as number).toBe(403);
    });
  });
});
