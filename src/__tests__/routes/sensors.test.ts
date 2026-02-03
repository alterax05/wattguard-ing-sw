/**
 * Integration tests for Sensors routes
 * 
 *Gestione sensori - CRUD completo
 * Tests cover:
 * - POST /api/sensors - Create sensor
 * - GET /api/sensors/:id - Get sensor details
 * - PATCH /api/sensors/:id - Update sensor
 * - DELETE /api/sensors/:id - Delete sensor (with cascade delete of readings)
 * - POST /api/sensors/:id/readings - Create reading
 * - GET /api/sensors/:id/readings - Get readings history
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";
import { Types } from "mongoose";

// Suppress console logs during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

let adminToken: string;
let operatorToken: string;
let adminUserId: string;
let operatorUserId: string;
let buildingId: string;

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

  // Create test users
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
  adminToken = adminTokenMatch![1]!;

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
  operatorToken = operatorTokenMatch![1]!;

  // Create a test building type and building
  const buildingType = await BuildingType.create({
    name: "Scuola",
    description: "Test building type",
  });

  const building = await Building.create({
    name: "Test Building",
    address: "Via Test 1",
    geographicZone: "Centro",
    buildingType: buildingType._id,
    surface: 1000,
    heatingSystemType: "caldaia_gas",
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
  buildingId = building._id.toString();
});

describe("Sensors Routes - Integration Tests", () => {
  // ============================================================================
  // POST /api/sensors - Create Sensor
  // ============================================================================

  describe("POST /api/sensors", () => {
    test("should create a new sensor (admin)", async () => {
      const sensorData = {
        buildingId,
        sensorType: "internal_temp",
        location: "Piano 1, Aula 101",
        serialNumber: "SN-12345",
        transmissionInterval: 90,
      };

      const res = await app.request("/api/sensors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify(sensorData),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.sensor.sensorType).toBe(sensorData.sensorType);
      expect(json.sensor.location).toBe(sensorData.location);
      expect(json.sensor.status).toBe("active");

      // Verify in database
      const dbSensor = await Sensor.findById(json.sensor.id);
      expect(dbSensor).toBeTruthy();

      
    });

    test("should create sensor with operator role", async () => {
      const sensorData = {
        buildingId,
        sensorType: "external_temp",
        location: "Facciata Nord",
      };

      const res = await app.request("/api/sensors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${operatorToken}`,
        },
        body: JSON.stringify(sensorData),
      });

      expect(res.status).toBe(201);
    });

    test("should reject duplicate serial number", async () => {
      await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "Test",
        serialNumber: "DUPLICATE-001",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await app.request("/api/sensors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          buildingId,
          sensorType: "external_temp",
          location: "Test 2",
          serialNumber: "DUPLICATE-001",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("already exists");
    });

    test("should reject invalid building ID", async () => {
      const res = await app.request("/api/sensors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          buildingId: "507f1f77bcf86cd799439011",
          sensorType: "internal_temp",
          location: "Test",
        }),
      });

      expect(res.status).toBe(404);
    });

    test("should reject invalid data", async () => {
      const res = await app.request("/api/sensors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          buildingId,
          sensorType: "invalid_type",
          location: "",
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ============================================================================
  // GET /api/sensors/:id - Get Sensor Details
  // ============================================================================

  describe("GET /api/sensors/:id", () => {
    test("should return sensor details", async () => {
      const sensor = await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "Piano 2",
        serialNumber: "SN-GET-001",
        installationDate: new Date(),
        transmissionInterval: 90,
        status: "active",
        createdBy: adminUserId,
        updatedBy: adminUserId,
        lastReading: {
          value: 22.5,
          unit: "°C",
          timestamp: new Date(),
        },
      });

      const res = await app.request(`/api/sensors/${sensor._id}`, {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sensor.id).toBeTruthy();
      expect(json.sensor.sensorType).toBe("internal_temp");
      expect(json.sensor.location).toBe("Piano 2");
      expect(json.sensor.lastReading).toBeTruthy();
      expect(json.sensor.lastReading.value).toBe(22.5);
    });

    test("should return 404 for non-existent sensor", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await app.request(`/api/sensors/${fakeId}`, {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  // ============================================================================
  // PATCH /api/sensors/:id - Update Sensor
  // ============================================================================

  describe("PATCH /api/sensors/:id", () => {
    test("should update sensor", async () => {
      const sensor = await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "Original Location",
        installationDate: new Date(),
        transmissionInterval: 90,
        status: "active",
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const updateData = {
        location: "Updated Location",
        status: "inactive",
      };

      const res = await app.request(`/api/sensors/${sensor._id}`, {
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
      expect(json.sensor.location).toBe("Updated Location");
      expect(json.sensor.status).toBe("inactive");

      
    });

    test("should return 404 for non-existent sensor", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await app.request(`/api/sensors/${fakeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          location: "Test",
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  // ============================================================================
  // DELETE /api/sensors/:id - Delete Sensor
  // ============================================================================

  describe("DELETE /api/sensors/:id", () => {
    test("should delete sensor and cascade delete readings", async () => {
      const sensor = await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "To Delete",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      // Create a reading
      await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "°C",
        metadata: {
          sensorId: sensor._id,
          buildingId: new Types.ObjectId(buildingId),
          sensorType: "internal_temp",
        },
      });

      const res = await app.request(`/api/sensors/${sensor._id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify deletion
      const deletedSensor = await Sensor.findById(sensor._id);
      expect(deletedSensor).toBeNull();

      // Verify readings deleted
      const readings = await SensorReading.countDocuments({
        "metadata.sensorId": sensor._id,
      });
      expect(readings).toBe(0);

      
    });

    test("should return 404 for non-existent sensor", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await app.request(`/api/sensors/${fakeId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(404);
    });
  });

  // ============================================================================
  // POST /api/sensors/:id/readings - Create Reading
  // ============================================================================

  describe("POST /api/sensors/:id/readings", () => {
    test("should create a sensor reading", async () => {
      const sensor = await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const readingData = {
        value: 23.5,
        unit: "°C",
        timestamp: new Date().toISOString(),
      };

      const res = await app.request(`/api/sensors/${sensor._id}/readings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify(readingData),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.reading.value).toBe(23.5);

      // Verify lastReading updated on sensor
      const updatedSensor = await Sensor.findById(sensor._id);
      expect(updatedSensor!.lastReading).toBeTruthy();
      expect(updatedSensor!.lastReading!.value).toBe(23.5);
    });

    test("should return 404 for non-existent sensor", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await app.request(`/api/sensors/${fakeId}/readings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          value: 20,
          unit: "°C",
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  // ============================================================================
  // GET /api/sensors/:id/readings - Get Readings History
  // ============================================================================

  describe("GET /api/sensors/:id/readings", () => {
    test("should return sensor readings history", async () => {
      const sensor = await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      // Create multiple readings
      const now = new Date();
      await SensorReading.create([
        {
          timestamp: new Date(now.getTime() - 300000), // 5 min ago
          value: 21.0,
          unit: "°C",
          metadata: {
            sensorId: sensor._id,
            buildingId: new Types.ObjectId(buildingId),
            sensorType: "internal_temp",
          },
        },
        {
          timestamp: new Date(now.getTime() - 180000), // 3 min ago
          value: 22.0,
          unit: "°C",
          metadata: {
            sensorId: sensor._id,
            buildingId: new Types.ObjectId(buildingId),
            sensorType: "internal_temp",
          },
        },
        {
          timestamp: now,
          value: 23.0,
          unit: "°C",
          metadata: {
            sensorId: sensor._id,
            buildingId: new Types.ObjectId(buildingId),
            sensorType: "internal_temp",
          },
        },
      ]);

      const res = await app.request(`/api/sensors/${sensor._id}/readings`, {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.readings.length).toBe(3);
      expect(json.readings[0].value).toBe(23.0); // Most recent first
      expect(json.readings[2].value).toBe(21.0); // Oldest last
    });

    test("should support date range filtering", async () => {
      const sensor = await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const now = new Date();
      await SensorReading.create([
        {
          timestamp: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          value: 20.0,
          unit: "°C",
          metadata: {
            sensorId: sensor._id,
            buildingId: new Types.ObjectId(buildingId),
            sensorType: "internal_temp",
          },
        },
        {
          timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day ago
          value: 22.0,
          unit: "°C",
          metadata: {
            sensorId: sensor._id,
            buildingId: new Types.ObjectId(buildingId),
            sensorType: "internal_temp",
          },
        },
      ]);

      const startDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago

      const res = await app.request(
        `/api/sensors/${sensor._id}/readings?startDate=${startDate}`,
        {
          headers: { "Authorization": `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.readings.length).toBe(1); // Only the reading from 1 day ago
      expect(json.readings[0].value).toBe(22.0);
    });

    test("should support pagination", async () => {
      const sensor = await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      // Create 5 readings
      const readings = Array.from({ length: 5 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60000),
        value: 20 + i,
        unit: "°C",
        metadata: {
          sensorId: sensor._id,
          buildingId: new Types.ObjectId(buildingId),
          sensorType: "internal_temp",
        },
      }));
      await SensorReading.create(readings);

      const res = await app.request(
        `/api/sensors/${sensor._id}/readings?limit=2&offset=0`,
        {
          headers: { "Authorization": `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.readings.length).toBe(2);
      expect(json.pagination.total).toBe(5);
      expect(json.pagination.limit).toBe(2);
      expect(json.pagination.offset).toBe(0);
    });

    test("should return 404 for non-existent sensor", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await app.request(`/api/sensors/${fakeId}/readings`, {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });
  });
});
