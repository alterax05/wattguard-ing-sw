import { describe, test, expect, beforeAll, afterAll, beforeEach, expectTypeOf } from "bun:test";
import { testClient } from "hono/testing";
import { z } from "zod";
import mongoose from "mongoose";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";
import { Alert } from "../../models/Alert";
import { EFFICIENCY_ALERT_TYPE } from "../../lib/alerts";
import { ErrorSchema } from "@wattguard/shared";
import type {
  CreateBuildingResponse,
  UpdateBuildingResponse,
  DeleteBuildingResponse,
  SearchBuildingsResponse,
  GetBuildingResponse,
  GetBuildingRealTimeResponse,
  GetBuildingHistoryResponse,
} from "@wattguard/shared";

type ErrorResponse = z.infer<typeof ErrorSchema>;

const client = testClient(app);

// Suppress console logs during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

let adminToken: string;
let operatorToken: string;
let adminUserId: mongoose.Types.ObjectId;
let buildingTypeId: mongoose.Types.ObjectId;

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
  adminUserId = admin._id as mongoose.Types.ObjectId;

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
  const adminLoginRes = await app.request("/api/v1/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@test.com",
      password: "admin123",
    }),
  });

  const adminCookie = adminLoginRes.headers.get("set-cookie");
  const adminTokenMatch = adminCookie?.match(/access_token=([^;]+)/);
  if (!adminTokenMatch) throw new Error("Admin token not found");
  adminToken = adminTokenMatch[1] as string;

  console.log("Admin login status:", adminLoginRes.status);
  console.log("Admin token:", adminToken ? "exists" : "missing");

  const operatorLoginRes = await app.request("/api/v1/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "operator@test.com",
      password: "operator123",
    }),
  });

  const operatorCookie = operatorLoginRes.headers.get("set-cookie");
  const operatorTokenMatch = operatorCookie?.match(/access_token=([^;]+)/);
  if (!operatorTokenMatch) throw new Error("Operator token not found");
  operatorToken = operatorTokenMatch[1] as string;

  // Create a test building type
  const buildingType = await BuildingType.create({
    name: "Scuola",
    description: "Edificio scolastico",
  });
  buildingTypeId = buildingType._id as mongoose.Types.ObjectId;
});

describe("Buildings Routes - Integration Tests", () => {
  describe("Create Building (POST /api/buildings)", () => {
    test("should create a new building with valid data (admin)", async () => {
      const buildingData = {
        name: "Scuola Primaria Test",
        address: "Via Test 123, Milano",
        geographicZone: "Centro",
        buildingType: buildingTypeId.toString(),
        surface: 2500,
        constructionYear: 1985,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
      };

      const res = await client.api.v1.buildings.$post(
        {
          json: buildingData,
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      if (res.status !== 201) {
        const errorText = await res.text();
        console.error("Create building failed:", res.status, errorText);
      }

      expect(res.status).toBe(201);
      const json = await res.json();
      expectTypeOf(json).toExtend<CreateBuildingResponse | ErrorResponse>();
      if (!("building" in json)) {
        throw new Error("Expected response to contain 'building'");
      }
      expect(json.success).toBe(true);
      expect(json.building.name).toBe(buildingData.name);
      expect(json.building.address).toBe(buildingData.address);
      expect(json.building.status).toBe("active"); // Default value

      // Verify building was created in DB
      const building = await Building.findById((json as { building: { id: string } }).building.id);
      expect(building).toBeDefined();
      expect(building!.name).toBe(buildingData.name);
    });

    test("should create building with operator role", async () => {
      const buildingData = {
        name: "Biblioteca Test",
        address: "Via Test 456, Milano",
        geographicZone: "Nord",
        buildingType: buildingTypeId.toString(),
        surface: 1500,
        constructionYear: 2010,
        heatingSystemType: "pompa_calore",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
      };

      const res = await client.api.v1.buildings.$post(
        {
          json: buildingData,
        },
        {
          headers: {
            Authorization: `Bearer ${operatorToken}`,
          },
        }
      );

      expect(res.status).toBe(201);
    });

    test("should reject invalid data", async () => {
      const invalidData = {
        name: "", // Empty name
        address: "Via Test",
        surface: -100, // Negative surface
      };

      const res = await client.api.v1.buildings.$post(
        {
          // @ts-expect-error intentionally incomplete building payload
          json: invalidData,
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status as number).toBe(400);
    });

    test("should reject invalid building type ID", async () => {
      const buildingData = {
        name: "Test Building",
        address: "Via Test 123",
        geographicZone: "Centro",
        buildingType: "invalid-id",
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
      };

      const res = await client.api.v1.buildings.$post(
        {
          json: buildingData,
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status as number).toBe(400);
    });
  });

  describe("Update Building (PATCH /api/buildings/:id)", () => {
    test("should update building", async () => {
      // Create a building first
      const building = await Building.create({
        name: "Original Name",
        address: "Via Original",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const updateData = {
        name: "Updated Name",
        surface: 1500,
        status: "inactive" as const,
      };

      const res = await client.api.v1.buildings[":id"].$patch(
        {
          param: { id: building._id.toString() },
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
      expectTypeOf(json).toExtend<UpdateBuildingResponse | ErrorResponse>();
      if (!("building" in json)) {
        throw new Error("Expected response to contain 'building'");
      }
      expect(json.success).toBe(true);
      expect(json.building.name).toBe("Updated Name");
      expect(json.building.surface).toBe(1500);
      expect(json.building.status).toBe("inactive");
    });

    test("should return 404 for non-existent building", async () => {
      const fakeId = "507f1f77bcf86cd799439011"; // Valid ObjectId format

      const res = await client.api.v1.buildings[":id"].$patch(
        {
          param: { id: fakeId },
          json: { name: "New Name" },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    test("PATCH accepts efficiencyThresholds and round-trips them", async () => {
      // Create a building first (same shape as the "should update building" test:
      // name, address, geographicZone, buildingType: buildingTypeId, surface,
      // constructionYear, heatingSystemType: "caldaia_gas",
      // location GeoJSON Point [11.1167, 46.0667], createdBy/updatedBy: adminUserId)
      const building = await Building.create({
        name: "Original Name",
        address: "Via Original",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await client.api.v1.buildings[":id"].$patch(
        {
          param: { id: building._id.toString() },
          json: { efficiencyThresholds: { enabled: true, minCop: 2.5 } },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<UpdateBuildingResponse | ErrorResponse>();
      if (!("building" in json)) {
        throw new Error("Expected response to contain 'building'");
      }
      expect(json.building.efficiencyThresholds).toEqual({ enabled: true, minCop: 2.5 });
    });

    test("PATCH rejects enabled threshold without minCop", async () => {
      const building = await Building.create({
        name: "Original Name",
        address: "Via Original",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await client.api.v1.buildings[":id"].$patch(
        {
          param: { id: building._id.toString() },
          json: { efficiencyThresholds: { enabled: true, minCop: null } },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      expect(res.status).toBe(400);
    });

    test("PATCH rejects efficiencyThresholds for district heating buildings", async () => {
      const building = await Building.create({
        name: "Original Name",
        address: "Via Original",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "Teleriscaldamento urbano",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await client.api.v1.buildings[":id"].$patch(
        {
          param: { id: building._id.toString() },
          json: { efficiencyThresholds: { enabled: true, minCop: 2.5 } },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      expect(res.status).toBe(400);
    });

    test("PATCH switching a building to district heating clears thresholds and resolves alerts", async () => {
      const building = await Building.create({
        name: "Original Name",
        address: "Via Original",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
        efficiencyThresholds: { enabled: true, minCop: 2.5 },
      });

      await Alert.create({
        buildingId: building._id,
        buildingName: building.name,
        type: EFFICIENCY_ALERT_TYPE,
        thresholdType: "min",
        severity: "high",
        value: 2.1,
        unit: "COP",
        limit: 2.5,
        location: building.name,
        status: "active",
      });

      const res = await client.api.v1.buildings[":id"].$patch(
        {
          param: { id: building._id.toString() },
          json: { heatingSystemType: "Teleriscaldamento" },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      expect(res.status).toBe(200);

      const reloaded = await Building.findById(building._id);
      expect(reloaded!.efficiencyThresholds.enabled).toBe(false);
      expect(reloaded!.efficiencyThresholds.minCop).toBeNull();

      const alert = await Alert.findOne({ buildingId: building._id, type: EFFICIENCY_ALERT_TYPE });
      expect(alert!.status).toBe("resolved");
    });

    test("PATCH disabling efficiency thresholds resolves active efficiency alerts", async () => {
      const building = await Building.create({
        name: "Original Name",
        address: "Via Original",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
        efficiencyThresholds: { enabled: true, minCop: 2.5 },
      });

      await Alert.create({
        buildingId: building._id,
        buildingName: building.name,
        type: EFFICIENCY_ALERT_TYPE,
        thresholdType: "min",
        severity: "high",
        value: 2.1,
        unit: "COP",
        limit: 2.5,
        location: building.name,
        status: "active",
      });

      const res = await client.api.v1.buildings[":id"].$patch(
        {
          param: { id: building._id.toString() },
          json: { efficiencyThresholds: { enabled: false, minCop: null } },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      expect(res.status).toBe(200);

      const alert = await Alert.findOne({ buildingId: building._id, type: EFFICIENCY_ALERT_TYPE });
      expect(alert!.status).toBe("resolved");
    });
  });

  describe("Delete Building (DELETE /api/buildings/:id)", () => {
    test("should delete building with cascade delete of sensors and readings", async () => {
      // Create building with sensors and readings
      const building = await Building.create({
        name: "Building to Delete",
        address: "Via Delete 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const sensor = await Sensor.create({
        buildingId: building._id,
        sensorType: "internal_temp",
        location: "Piano 1",
        status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "°C",
        metadata: {
          sensorId: sensor._id,
          buildingId: building._id,
          sensorType: "internal_temp",
        },
      });

      await Alert.create({
        buildingId: building._id,
        buildingName: building.name,
        sensorId: sensor._id,
        type: "threshold_exceeded",
        thresholdType: "max",
        severity: "high",
        sensorType: "internal_temp",
        location: "Sala",
        value: 35,
        unit: "°C",
        limit: 30,
        status: "active",
      });

      const res = await client.api.v1.buildings[":id"].$delete(
        {
          param: { id: building._id.toString() },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<DeleteBuildingResponse | ErrorResponse>();
      if (!("success" in json)) {
        throw new Error("Expected response to contain 'success'");
      }
      expect(json.success).toBe(true);

      // Verify building deleted
      const deletedBuilding = await Building.findById(building._id);
      expect(deletedBuilding).toBeNull();

      // Verify sensors deleted
      const deletedSensor = await Sensor.findById(sensor._id);
      expect(deletedSensor).toBeNull();

      // Verify readings deleted
      const readings = await SensorReading.find({ "metadata.buildingId": building._id });
      expect(readings.length).toBe(0);

      const alerts = await Alert.countDocuments({ buildingId: building._id });
      expect(alerts).toBe(0);
    });
  });

  describe("Search Buildings (GET /api/buildings)", () => {
    beforeEach(async () => {
      // Create multiple buildings for search testing
      const buildings = [
        {
          name: "Scuola Primaria Centro",
          address: "Via Roma 10, Milano",
          geographicZone: "Centro",
          buildingType: buildingTypeId,
          surface: 2500,
          constructionYear: 1985,
          heatingSystemType: "caldaia_gas",
          location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
          createdBy: adminUserId,
          updatedBy: adminUserId,
          status: "active",
        },
        {
          name: "Scuola Secondaria Nord",
          address: "Via Garibaldi 20, Milano",
          geographicZone: "Nord",
          buildingType: buildingTypeId,
          surface: 3000,
          constructionYear: 1995,
          heatingSystemType: "teleriscaldamento",
          location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
          createdBy: adminUserId,
          updatedBy: adminUserId,
          status: "active",
        },
        {
          name: "Biblioteca Sud",
          address: "Via Dante 30, Milano",
          geographicZone: "Sud",
          buildingType: buildingTypeId,
          surface: 1500,
          constructionYear: 2010,
          heatingSystemType: "pompa_calore",
          location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
          createdBy: adminUserId,
          updatedBy: adminUserId,
          status: "inactive",
        },
      ];
      await Building.insertMany(buildings);
    });

    test("should search by name", async () => {
      const res = await client.api.v1.buildings.$get(
        {
          query: { name: "Scuola" },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<SearchBuildingsResponse | ErrorResponse>();
      if (!("buildings" in json)) {
        throw new Error("Expected response to contain 'buildings'");
      }
      expect(json.buildings.length).toBe(2);
      expect(json.buildings[0]!.name).toContain("Scuola");
    });

    test("should search by address", async () => {
      const res = await client.api.v1.buildings.$get(
        {
          query: { address: "Garibaldi" },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("buildings" in json)) {
        throw new Error("Expected response to contain 'buildings'");
      }
      expect(json.buildings.length).toBe(1);
      expect(json.buildings[0]!.address).toContain("Garibaldi");
    });

    test("should filter by zone", async () => {
      const res = await client.api.v1.buildings.$get(
        {
          query: { zone: "Centro" },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("buildings" in json)) {
        throw new Error("Expected response to contain 'buildings'");
      }
      expect(json.buildings.length).toBe(1);
      expect(json.buildings[0]!.geographicZone).toBe("Centro");
    });

    test("should filter by building type", async () => {
      const res = await client.api.v1.buildings.$get(
        {
          query: { buildingType: buildingTypeId.toString() },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("buildings" in json)) {
        throw new Error("Expected response to contain 'buildings'");
      }
      expect(json.buildings.length).toBe(3); // All test buildings have same type
    });

    test("should filter by status", async () => {
      const res = await client.api.v1.buildings.$get(
        {
          query: { status: "inactive" },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("buildings" in json)) {
        throw new Error("Expected response to contain 'buildings'");
      }
      expect(json.buildings.length).toBe(1);
      expect(json.buildings[0]!.status).toBe("inactive");
    });

    test("should combine multiple filters", async () => {
      const res = await client.api.v1.buildings.$get(
        {
          query: { zone: "Centro", status: "active", name: "Scuola" },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("buildings" in json)) {
        throw new Error("Expected response to contain 'buildings'");
      }
      expect(json.buildings.length).toBe(1);
      expect(json.buildings[0]!.name).toBe("Scuola Primaria Centro");
    });

    test("should support pagination", async () => {
      const res = await client.api.v1.buildings.$get(
        {
          query: { limit: "2", offset: "0" },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("buildings" in json) || !("pagination" in json)) {
        throw new Error("Expected response to contain 'buildings' and 'pagination'");
      }
      expect(json.buildings.length).toBe(2);
      expect(json.pagination.total).toBe(3);
      expect(json.pagination.limit).toBe(2);
      expect(json.pagination.offset).toBe(0);
    });

    test("should support sorting", async () => {
      const res = await client.api.v1.buildings.$get(
        {
          query: { sortBy: "name", sortOrder: "asc" },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("buildings" in json)) {
        throw new Error("Expected response to contain 'buildings'");
      }
      expect(json.buildings.length).toBeGreaterThan(0);
      // Verify ascending order
      for (let i = 1; i < json.buildings.length; i++) {
        expect(json.buildings[i]!.name >= json.buildings[i - 1]!.name).toBe(true);
      }
    });

    test("should return all required details in search results", async () => {
      const res = await client.api.v1.buildings.$get(
        { query: {} },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("buildings" in json)) {
        throw new Error("Expected response to contain 'buildings'");
      }
      const building = json.buildings[0]!;

      expect(building.name).toBeDefined();
      expect(building.address).toBeDefined();
      expect(building.surface).toBeDefined();
      expect(building.heatingSystemType).toBeDefined();
      expect(building.status).toBeDefined();
      expect(building.updatedAt).toBeDefined();
    });
  });

  describe("Get Building Details (GET /api/buildings/:id)", () => {
    test("should return complete building details", async () => {
      const building = await Building.create({
        name: "Test Building Details",
        address: "Via Details 1, Milano",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 2000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await client.api.v1.buildings[":id"].$get(
        {
          param: { id: building._id.toString() },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<GetBuildingResponse | ErrorResponse>();
      if (!("building" in json)) {
        throw new Error("Expected response to contain 'building'");
      }
      expect(json.building.name).toBe("Test Building Details");
      expect(json.building.address).toBe("Via Details 1, Milano");
      expect(json.building.surface).toBe(2000);
      expect(json.building.constructionYear).toBe(2000);
      expect(json.building.buildingType).toBeDefined();
    });
  });

  describe("Get Real-time Data (GET /api/buildings/:id/real-time)", () => {
    test("should return real-time data for all sensor types", async () => {
      const building = await Building.create({
        name: "Building Real-time",
        address: "Via Real-time 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const now = new Date();

      await Sensor.create([
        {
          buildingId: building._id,
          sensorType: "internal_temp",
          location: "Piano 1",
          status: "active",
          installationDate: new Date(),
          transmissionInterval: 90,
          createdBy: adminUserId,
          updatedBy: adminUserId,
          lastReading: { value: 22.5, unit: "°C", timestamp: now },
        },
        {
          buildingId: building._id,
          sensorType: "external_temp",
          location: "Facciata",
          status: "active",
          installationDate: new Date(),
          transmissionInterval: 90,
          createdBy: adminUserId,
          updatedBy: adminUserId,
          lastReading: { value: 10.2, unit: "°C", timestamp: now },
        },
        {
          buildingId: building._id,
          sensorType: "energy_meter",
          location: "Locale tecnico",
          status: "active",
          installationDate: new Date(),
          transmissionInterval: 90,
          createdBy: adminUserId,
          updatedBy: adminUserId,
          lastReading: { value: 150.5, unit: "kW", timestamp: now },
        },
      ]);

      const res = await client.api.v1.buildings[":id"]["real-time"].$get(
        {
          param: { id: building._id.toString() },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<GetBuildingRealTimeResponse | ErrorResponse>();
      if (!("data" in json)) {
        throw new Error("Expected response to contain 'data'");
      }
      expect(json.data).toBeDefined();
      expect(json.data.internalTemperature).toBeDefined();
      expect(json.data.internalTemperature.value).toBe(22.5);
      expect(json.data.internalTemperature.unit).toBe("°C");

      expect(json.data.externalTemperature).toBeDefined();
      expect(json.data.externalTemperature.value).toBe(10.2);

      expect(json.data.energyConsumption).toBeDefined();
      expect(json.data.energyConsumption.value).toBe(150.5);
      expect(json.data.energyConsumption.unit).toBe("kW");
    });

    test("should handle missing sensors gracefully", async () => {
      const building = await Building.create({
        name: "Building Partial Sensors",
        address: "Via Partial 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      // Only create one sensor
      await Sensor.create({
        buildingId: building._id,
        sensorType: "internal_temp",
        location: "Piano 1",
        status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
        lastReading: { value: 22.5, unit: "°C", timestamp: new Date() },
      });

      const res = await client.api.v1.buildings[":id"]["real-time"].$get(
        {
          param: { id: building._id.toString() },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("data" in json)) {
        throw new Error("Expected response to contain 'data'");
      }
      expect(json.data.internalTemperature.value).toBe(22.5);
      expect(json.data.externalTemperature.value).toBeNull();
      expect(json.data.energyConsumption.value).toBeNull();
    });
  });

  describe("Get Historical Data (GET /api/buildings/:id/history)", () => {
    test("should return historical data with time aggregation", async () => {
      const building = await Building.create({
        name: "Building History",
        address: "Via History 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const sensor = await Sensor.create({
        buildingId: building._id,
        sensorType: "internal_temp",
        location: "Piano 1",
        status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      // Create readings for the last 24 hours
      const now = new Date();
      const readings = [];
      for (let i = 0; i < 24; i++) {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000); // Every hour
        readings.push({
          timestamp,
          value: 20 + Math.random() * 4, // 20-24°C
          unit: "°C",
          metadata: {
            sensorId: sensor._id,
            buildingId: building._id,
            sensorType: "internal_temp",
          },
        });
      }
      await SensorReading.insertMany(readings);

      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const endDate = now.toISOString();

      const res = await client.api.v1.buildings[":id"].history.$get(
        {
          param: { id: building._id.toString() },
          query: { startDate, endDate, sensorType: "internal_temp", interval: "hour" },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<GetBuildingHistoryResponse | ErrorResponse>();
      if (!("data" in json)) {
        throw new Error("Expected response to contain 'data'");
      }
      expect(json.data).toBeDefined();
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.buildingId).toBe(building._id.toString());
      expect(json.buildingName).toBe(building.name);

      // Verify data structure
      const dataPoint = json.data[0]!;
      expect(dataPoint.timestamp).toBeDefined();
      expect(dataPoint.value).toBeDefined();
      expect(dataPoint.sensorType).toBe("internal_temp");
    });

    test("should filter by date range", async () => {
      const building = await Building.create({
        name: "Building Date Filter",
        address: "Via Date 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const sensor = await Sensor.create({
        buildingId: building._id,
        sensorType: "energy_meter",
        location: "Locale tecnico",
        status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      await SensorReading.insertMany([
        {
          timestamp: twoDaysAgo,
          value: 100,
          unit: "kW",
          metadata: { sensorId: sensor._id, buildingId: building._id, sensorType: "energy_meter" },
        },
        {
          timestamp: oneDayAgo,
          value: 150,
          unit: "kW",
          metadata: { sensorId: sensor._id, buildingId: building._id, sensorType: "energy_meter" },
        },
        {
          timestamp: now,
          value: 200,
          unit: "kW",
          metadata: { sensorId: sensor._id, buildingId: building._id, sensorType: "energy_meter" },
        },
      ]);

      // Query only last 24 hours
      const startDate = oneDayAgo.toISOString();
      const endDate = now.toISOString();

      const res = await client.api.v1.buildings[":id"].history.$get(
        {
          param: { id: building._id.toString() },
          query: { startDate, endDate, sensorType: "energy_meter" },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("data" in json)) {
        throw new Error("Expected response to contain 'data'");
      }
      // Should only include readings from the last 24 hours
      expect(json.data.length).toBeGreaterThan(0);
      json.data.forEach((point) => {
        const timestamp = new Date(point.timestamp);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(oneDayAgo.getTime());
      });
    });

    test("should support different interval types", async () => {
      const building = await Building.create({
        name: "Building Intervals",
        address: "Via Intervals 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const sensor = await Sensor.create({
        buildingId: building._id,
        sensorType: "internal_temp",
        location: "Piano 1",
        status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const now = new Date();
      const readings = [];
      for (let i = 0; i < 100; i++) {
        readings.push({
          timestamp: new Date(now.getTime() - i * 5 * 60 * 1000), // Every 5 minutes
          value: 22,
          unit: "°C",
          metadata: { sensorId: sensor._id, buildingId: building._id, sensorType: "internal_temp" },
        });
      }
      await SensorReading.insertMany(readings);

      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const endDate = now.toISOString();

      // Test different intervals (currently not implemented in aggregation, just verify data is returned)
      const intervals = ["minute", "hour", "day"] as const;

      for (const interval of intervals) {
        const res = await client.api.v1.buildings[":id"].history.$get(
          {
            param: { id: building._id.toString() },
            query: { startDate, endDate, sensorType: "internal_temp", interval },
          },
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        );

        expect(res.status).toBe(200);
        const json = await res.json();
        if (!("data" in json)) {
          throw new Error("Expected response to contain 'data'");
        }
        expect(json.data.length).toBeGreaterThan(0);
        expect(json.buildingId).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Authorization Tests
  // ============================================================================

  describe("Authorization", () => {
    test("should deny access without token", async () => {
      const res = await client.api.v1.buildings.$get({ query: {} });
      expect(res.status as number).toBe(401);
    });

    test("should deny access with invalid token", async () => {
      const res = await client.api.v1.buildings.$get(
        { query: {} },
        {
          headers: {
            Authorization: "Bearer invalid-token",
          },
        }
      );

      expect(res.status as number).toBe(401);
    });

    test("should allow both admin and operator to read buildings", async () => {
      const building = await Building.create({
        name: "Test Auth",
        address: "Via Auth 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point" as const, coordinates: [11.1167, 46.0667] as [number, number] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      // Admin should have access
      const adminRes = await client.api.v1.buildings[":id"].$get(
        {
          param: { id: building._id.toString() },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      expect(adminRes.status).toBe(200);

      // Operator should also have access
      const operatorRes = await client.api.v1.buildings[":id"].$get(
        {
          param: { id: building._id.toString() },
        },
        {
          headers: { Authorization: `Bearer ${operatorToken}` },
        }
      );
      expect(operatorRes.status).toBe(200);
    });
  });
});
