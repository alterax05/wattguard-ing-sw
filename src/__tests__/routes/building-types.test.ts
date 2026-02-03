/**
 * Integration tests for Building Types routes
 * 
 * Tests the CRUD operations for building types:
 * - GET /api/building-types - List all building types (admin + operator)
 * - POST /api/building-types - Create new building type (admin only)
 * - PATCH /api/building-types/:id - Update building type (admin only)
 * - DELETE /api/building-types/:id - Delete building type (admin only)
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";

// Suppress console logs during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

let adminToken: string;
let operatorToken: string;
let adminUserId: string;
let operatorUserId: string;

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

  const operator = await User.create({
    email: "operator@test.com",
    role: "operator",
    passwordHash: operatorPasswordHash,
  });
  operatorUserId = operator._id.toString();

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
      const res = await app.request("/api/building-types", {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildingTypes).toEqual([]);
    });

    test("should list all building types (admin)", async () => {
      // Create test building types
      await BuildingType.create([
        { name: "Scuola", description: "Edificio scolastico" },
        { name: "Ospedale", description: "Struttura sanitaria" },
        { name: "Ufficio", description: "Edificio per uffici" },
      ]);

      const res = await app.request("/api/building-types", {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildingTypes.length).toBe(3);
      expect(json.buildingTypes[0].name).toBeTruthy();
      expect(json.buildingTypes[0].description).toBeTruthy();
      expect(json.buildingTypes[0].id).toBeTruthy();
      expect(json.buildingTypes[0].createdAt).toBeTruthy();
      expect(json.buildingTypes[0].updatedAt).toBeTruthy();
    });

    test("should list all building types (operator)", async () => {
      await BuildingType.create([
        { name: "Scuola", description: "Edificio scolastico" },
      ]);

      const res = await app.request("/api/building-types", {
        headers: { "Authorization": `Bearer ${operatorToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildingTypes.length).toBe(1);
    });

    test("should reject request without token (401)", async () => {
      const res = await app.request("/api/building-types");

      expect(res.status).toBe(401);
    });

    test("should return building types sorted by name", async () => {
      await BuildingType.create([
        { name: "Ufficio", description: "C" },
        { name: "Scuola", description: "B" },
        { name: "Ospedale", description: "A" },
      ]);

      const res = await app.request("/api/building-types", {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildingTypes[0].name).toBe("Ospedale");
      expect(json.buildingTypes[1].name).toBe("Scuola");
      expect(json.buildingTypes[2].name).toBe("Ufficio");
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

      const res = await app.request("/api/building-types", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify(buildingTypeData),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.buildingType.name).toBe(buildingTypeData.name);
      expect(json.buildingType.description).toBe(buildingTypeData.description);
      expect(json.buildingType.id).toBeTruthy();

      // Verify in database
      const dbBuildingType = await BuildingType.findById(json.buildingType.id);
      expect(dbBuildingType).toBeTruthy();
      expect(dbBuildingType!.name).toBe(buildingTypeData.name);
    });

    test("should reject duplicate name", async () => {
      await BuildingType.create({
        name: "Scuola",
        description: "Existing",
      });

      const res = await app.request("/api/building-types", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Scuola",
          description: "Duplicate",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("already exists");
    });

    test("should reject invalid data", async () => {
      const res = await app.request("/api/building-types", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "", // Empty name
          description: "Test",
        }),
      });

      expect(res.status).toBe(400);
    });

    test("should reject request from operator (403)", async () => {
      const res = await app.request("/api/building-types", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${operatorToken}`,
        },
        body: JSON.stringify({
          name: "Test",
          description: "Test",
        }),
      });

      expect(res.status).toBe(403);
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

      const res = await app.request(`/api/building-types/${buildingType._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify(updateData),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
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

      const res = await app.request(`/api/building-types/${buildingType._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Updated Name Only",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildingType.name).toBe("Updated Name Only");
      expect(json.buildingType.description).toBe("Original Description");
    });

    test("should update only description", async () => {
      const buildingType = await BuildingType.create({
        name: "Original Name",
        description: "Original",
      });

      const res = await app.request(`/api/building-types/${buildingType._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          description: "Updated Description Only",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
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

      const res = await app.request(`/api/building-types/${buildingType._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Existing",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("already exists");
    });

    test("should return 404 for non-existent building type", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await app.request(`/api/building-types/${fakeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Test",
        }),
      });

      expect(res.status).toBe(404);
    });

    test("should reject request from operator (403)", async () => {
      const buildingType = await BuildingType.create({
        name: "Test",
        description: "Test",
      });

      const res = await app.request(`/api/building-types/${buildingType._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${operatorToken}`,
        },
        body: JSON.stringify({
          name: "Updated",
        }),
      });

      expect(res.status).toBe(403);
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

      const res = await app.request(`/api/building-types/${buildingType._id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
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
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await app.request(`/api/building-types/${buildingType._id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Cannot delete");
      expect(json.error).toContain("building(s) are using it");

      // Verify building type still exists
      const stillExists = await BuildingType.findById(buildingType._id);
      expect(stillExists).toBeTruthy();
    });

    test("should return 404 for non-existent building type", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await app.request(`/api/building-types/${fakeId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(404);
    });

    test("should reject request from operator (403)", async () => {
      const buildingType = await BuildingType.create({
        name: "Test",
        description: "Test",
      });

      const res = await app.request(`/api/building-types/${buildingType._id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${operatorToken}`,
        },
      });

      expect(res.status).toBe(403);
    });
  });
});
