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
  CreateSensorResponse,
  GetSensorResponse,
  UpdateSensorResponse,
  DeleteSensorResponse,
  ListSensorsResponse,
  GetSensorReadingsResponse,
} from "@wattguard/shared";

type ErrorResponse = z.infer<typeof ErrorSchema>;

const client = testClient(app);
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";
import { Alert } from "../../models/Alert";
import { Types } from "mongoose";

// Suppress console logs during tests

let adminToken: string;
let operatorToken: string;
let adminUserId: string;
let buildingId: string;

setupIntegrationTests();


beforeEach(async () => {

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
  adminToken = adminTokenMatch![1]!;

  const operatorLoginRes = await client.api.v1.auth.local.login.$post({
    json: {
      email: "operator@test.com",
      password: "operator123",
    },
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
    location: { type: "Point", coordinates: [11.1167, 46.0667] },
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
  buildingId = building._id.toString();
});

describe("sensors api", () => {
  // ============================================================================
  // POST /api/sensors - Create Sensor
  // ============================================================================

  describe("POST /api/v1/sensors", () => {
    test("creates a new sensor (admin)", async () => {
      const sensorData = {
        buildingId,
        sensorType: "internal_temp" as const,
        location: "Piano 1, Aula 101",
        serialNumber: "SN-12345",
        transmissionInterval: 90,
      };

      const res = await client.api.v1.sensors.$post(
        {
          json: sensorData,
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(201);
      const json = await res.json();

      expectTypeOf(json).toExtend<CreateSensorResponse | ErrorResponse>();
      if (!("sensor" in json)) {
        throw new Error("Expected response to contain 'sensor'");
      }
      expect(res.headers.get("location")).toBe(`/api/v1/sensors/${json.sensor.id}`);
      expect(json.success).toBe(true);
      expect(json.sensor.sensorType).toBe(sensorData.sensorType);
      expect(json.sensor.location).toBe(sensorData.location);
      expect(json.sensor.status).toBe("active");

      // Verify in database
      const dbSensor = await Sensor.findById(json.sensor.id);
      expect(dbSensor).toBeDefined();

      
    });

    test("creates sensor with operator role", async () => {
      const sensorData = {
        buildingId,
        sensorType: "external_temp" as const,
        location: "Facciata Nord",
      };

      const res = await client.api.v1.sensors.$post(
        {
          json: sensorData,
        },
        {
          headers: {
            Authorization: `Bearer ${operatorToken}`,
          },
        }
      );

      expect(res.status).toBe(201);
    });

    test("rejects duplicate serial number", async () => {
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

      const res = await client.api.v1.sensors.$post(
        {
          json: {
            buildingId,
            sensorType: "external_temp",
            location: "Test 2",
            serialNumber: "DUPLICATE-001",
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

    test("rejects invalid building ID", async () => {
      const res = await client.api.v1.sensors.$post(
        {
          json: {
            buildingId: "507f1f77bcf86cd799439011",
            sensorType: "internal_temp",
            location: "Test",
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

    test("rejects invalid data", async () => {
      const res = await client.api.v1.sensors.$post(
        {
          json: {
            buildingId,
            // @ts-expect-error intentionally invalid sensor type
            sensorType: "invalid_type",
            location: "",
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
  });

  // ============================================================================
  // GET /api/sensors/:id - Get Sensor Details
  // ============================================================================

  describe("GET /api/v1/sensors/:id", () => {
    test("returns sensor details", async () => {
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

      const res = await client.api.v1.sensors[":id"].$get(
        {
          param: { id: sensor._id.toString() },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<GetSensorResponse | ErrorResponse>();
      if (!("sensor" in json)) {
        throw new Error("Expected response to contain 'sensor'");
      }
      expect(json.sensor.id).toBeDefined();
      expect(json.sensor.sensorType).toBe("internal_temp");
      expect(json.sensor.location).toBe("Piano 2");
      expect(json.sensor.lastReading).toBeDefined();
      expect(json.sensor.lastReading!.value).toBe(22.5);
      expect(json.sensor.isOffline).toBe(false);
    });

    test("returns 404 for non-existent sensor", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await client.api.v1.sensors[":id"].$get(
        {
          param: { id: fakeId },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(404);
    });
  });

  // ============================================================================
  // PATCH /api/sensors/:id - Update Sensor
  // ============================================================================

  describe("PATCH /api/v1/sensors/:id", () => {
    test("updates sensor", async () => {
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
        status: "inactive" as const,
      };

      const res = await client.api.v1.sensors[":id"].$patch(
        {
          param: { id: sensor._id.toString() },
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
      expectTypeOf(json).toExtend<UpdateSensorResponse | ErrorResponse>();
      if (!("sensor" in json)) {
        throw new Error("Expected response to contain 'sensor'");
      }
      expect(json.success).toBe(true);
      expect(json.sensor.location).toBe("Updated Location");
      expect(json.sensor.status).toBe("inactive");

      
    });

    test("returns 404 for non-existent sensor", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await client.api.v1.sensors[":id"].$patch(
        {
          param: { id: fakeId },
          json: {
            location: "Test",
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

    test("deletes alerts for a removed threshold without deleting alerts for the other threshold", async () => {
      const sensor = await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "Threshold Sensor",
        installationDate: new Date(),
        transmissionInterval: 90,
        minThreshold: 10,
        maxThreshold: 30,
        status: "active",
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const minAlert = await Alert.create({
        buildingId,
        buildingName: "Test Building",
        sensorId: sensor._id,
        type: "threshold_exceeded",
        thresholdType: "min",
        severity: "high",
        sensorType: "internal_temp",
        location: "Sala",
        value: 5,
        unit: "°C",
        limit: 10,
        status: "active",
      });
      const maxAlert = await Alert.create({
        buildingId,
        buildingName: "Test Building",
        sensorId: sensor._id,
        type: "threshold_exceeded",
        thresholdType: "max",
        severity: "high",
        sensorType: "internal_temp",
        location: "Sala",
        value: 35,
        unit: "°C",
        limit: 30,
        status: "acknowledged",
      });
      const legacyAlert = await Alert.create({
        buildingId,
        buildingName: "Test Building",
        sensorId: sensor._id,
        type: "threshold_exceeded",
        severity: "high",
        sensorType: "internal_temp",
        location: "Sala",
        value: 40,
        unit: "°C",
        limit: 30,
        status: "active",
      });
      const unrelatedAlert = await Alert.create({
        buildingId,
        buildingName: "Test Building",
        sensorId: sensor._id,
        type: "efficiency_below_threshold",
        severity: "medium",
        sensorType: "energy_meter",
        location: "Quadro",
        status: "active",
      });

      const res = await client.api.v1.sensors[":id"].$patch(
        {
          param: { id: sensor._id.toString() },
          json: { maxThreshold: null },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      expect((await Sensor.findById(sensor._id))!.maxThreshold).toBeUndefined();
      expect(await Alert.findById(minAlert._id)).toBeDefined();
      expect(await Alert.findById(maxAlert._id)).toBeNull();
      expect(await Alert.findById(legacyAlert._id)).toBeNull();
      expect(await Alert.findById(unrelatedAlert._id)).toBeDefined();
    });
  });

  // ============================================================================
  // DELETE /api/sensors/:id - Delete Sensor
  // ============================================================================

  describe("DELETE /api/v1/sensors/:id", () => {
    test("deletes sensor and cascade delete readings", async () => {
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

      await Alert.create({
        buildingId,
        buildingName: "Test Building",
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

      const res = await client.api.v1.sensors[":id"].$delete(
        {
          param: { id: sensor._id.toString() },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<DeleteSensorResponse | ErrorResponse>();
      if (!("success" in json)) {
        throw new Error("Expected response to contain 'success'");
      }
      expect(json.success).toBe(true);

      // Verify deletion
      const deletedSensor = await Sensor.findById(sensor._id);
      expect(deletedSensor).toBeNull();

      // Verify readings deleted
      const readings = await SensorReading.countDocuments({
        "metadata.sensorId": sensor._id,
      });
      expect(readings).toBe(0);

      const alerts = await Alert.countDocuments({ sensorId: sensor._id });
      expect(alerts).toBe(0);

      
    });

    test("returns 404 for non-existent sensor", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await client.api.v1.sensors[":id"].$delete(
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
  });

  // ============================================================================
  // GET /api/sensors - Automatic inactivity detection
  // ============================================================================

  describe("inactivity detection", () => {
    test("marks an active sensor as inactive when it exceeds 2× transmissionInterval", async () => {
      const transmissionInterval = 60; // 60 s
      // lastReading is 200 s ago → exceeds 2 × 60 = 120 s
      const staleTimestamp = new Date(Date.now() - 200_000);

      const sensor = await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "Piano 1",
        installationDate: new Date(),
        transmissionInterval,
        status: "active",
        lastReading: { value: 22, unit: "°C", timestamp: staleTimestamp },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await client.api.v1.sensors.$get(
        { query: {} },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<ListSensorsResponse | ErrorResponse>();
      if (!("sensors" in json)) throw new Error("missing sensors");
      const found = json.sensors.find((s) => s.id === sensor._id.toString());
      expect(found).toBeDefined();
      expect(found!.status).toBe("inactive");
      expect(found!.isOffline).toBe(true);

      // GET is a safe method: status is computed in memory without mutating the DB
      const dbSensor = await Sensor.findById(sensor._id);
      expect(dbSensor).toBeDefined();
    });


    test("does not mark an active sensor as inactive when reading is within 2× transmissionInterval", async () => {
      const transmissionInterval = 300; // 300 s
      // lastReading is 100 s ago → within 2 × 300 = 600 s
      const freshTimestamp = new Date(Date.now() - 100_000);

      const sensor = await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "Piano 2",
        installationDate: new Date(),
        transmissionInterval,
        status: "active",
        lastReading: { value: 20, unit: "°C", timestamp: freshTimestamp },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await client.api.v1.sensors.$get(
        { query: {} },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("sensors" in json)) throw new Error("missing sensors");
      const found = json.sensors.find((s) => s.id === sensor._id.toString());
      expect(found).toBeDefined();
      expect(found!.status).toBe("active");
      expect(found!.isOffline).toBe(false);
    });

    test("does not change status of sensors in maintenance or error when they have stale readings", async () => {
      const staleTimestamp = new Date(Date.now() - 600_000); // 10 min ago

      const maintenanceSensor = await Sensor.create({
        buildingId,
        sensorType: "internal_temp",
        location: "Manutenzione",
        installationDate: new Date(),
        transmissionInterval: 90,
        status: "maintenance",
        lastReading: { value: 18, unit: "°C", timestamp: staleTimestamp },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const errorSensor = await Sensor.create({
        buildingId,
        sensorType: "external_temp",
        location: "Errore",
        installationDate: new Date(),
        transmissionInterval: 90,
        status: "error",
        lastReading: { value: 5, unit: "°C", timestamp: staleTimestamp },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await client.api.v1.sensors.$get(
        { query: {} },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("sensors" in json)) throw new Error("missing sensors");

      const m = json.sensors.find((s) => s.id === maintenanceSensor._id.toString());
      expect(m!.status).toBe("maintenance");
      expect(m!.isOffline).toBe(false);

      const e = json.sensors.find((s) => s.id === errorSensor._id.toString());
      expect(e!.status).toBe("error");
      expect(e!.isOffline).toBe(false);
    });

    test("marks active sensor with no lastReading as inactive", async () => {
      const sensor = await Sensor.create({
        buildingId,
        sensorType: "energy_meter",
        location: "Contatore",
        installationDate: new Date(),
        transmissionInterval: 90,
        status: "active",
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await client.api.v1.sensors.$get(
        { query: {} },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("sensors" in json)) throw new Error("missing sensors");
      const found = json.sensors.find((s) => s.id === sensor._id.toString());
      expect(found!.status).toBe("inactive");
    });
  });

  // ============================================================================
  // GET /api/sensors/:id/readings - Get Readings History
  // ============================================================================

  describe("GET /api/v1/sensors/:id/readings", () => {
    test("returns sensor readings history", async () => {
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

      const res = await client.api.v1.sensors[":id"].readings.$get(
        {
          param: { id: sensor._id.toString() },
          query: {},
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expectTypeOf(json).toExtend<GetSensorReadingsResponse | ErrorResponse>();
      if (!("readings" in json)) {
        throw new Error("Expected response to contain 'readings'");
      }
      expect(json.readings.length).toBe(3);
      expect(json.readings[0]!.value).toBe(23.0); // Most recent first
      expect(json.readings[2]!.value).toBe(21.0); // Oldest last
    });

    test("supports date range filtering", async () => {
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

      const res = await client.api.v1.sensors[":id"].readings.$get(
        {
          param: { id: sensor._id.toString() },
          query: { startDate },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("readings" in json)) {
        throw new Error("Expected response to contain 'readings'");
      }
      expect(json.readings.length).toBe(1); // Only the reading from 1 day ago
      expect(json.readings[0]!.value).toBe(22.0);
    });

    test("supports pagination", async () => {
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

      const res = await client.api.v1.sensors[":id"].readings.$get(
        {
          param: { id: sensor._id.toString() },
          query: { limit: "2", offset: "0" },
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      if (!("readings" in json) || !("pagination" in json)) {
        throw new Error("Expected response to contain 'readings' and 'pagination'");
      }
      expect(json.readings.length).toBe(2);
      expect(json.pagination.total).toBe(5);
      expect(json.pagination.limit).toBe(2);
      expect(json.pagination.offset).toBe(0);
    });

    test("returns 404 for non-existent sensor", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await client.api.v1.sensors[":id"].readings.$get(
        {
          param: { id: fakeId },
          query: {},
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(404);
    });
  });
});
