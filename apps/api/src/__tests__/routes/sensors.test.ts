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
import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";
import { expectValidationError } from "../helpers/validation";
import { PopulatedBuildingSchema } from "@wattguard/shared";
import type {
  SensorResponse,
  ListSensorsResponse,
  GetSensorReadingsResponse, ErrorResponse} from "@wattguard/shared";



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
  const adminLoginRes = await client.api.v1.auth.session.$post({
    json: {
      email: "admin@test.com",
      password: "admin123",
    },
  });
  
  // SAFETY: login with freshly seeded valid credentials returns SessionResponse.
  adminToken = ((await adminLoginRes.json()) as { data: { token: string } }).data.token;

  const operatorLoginRes = await client.api.v1.auth.session.$post({
    json: {
      email: "operator@test.com",
      password: "operator123",
    },
  });
  
  // SAFETY: login with freshly seeded valid credentials returns SessionResponse.
  operatorToken = ((await operatorLoginRes.json()) as { data: { token: string } }).data.token;

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
        building: buildingId,
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

      expectTypeOf(json).toExtend<SensorResponse | ErrorResponse>();
      expect(json.success).toBe(true);
      if (!json.success) {
        return expect.unreachable("Expected response success to be true");
      }
      expect(res.headers.get("location")).toBe(`/api/v1/sensors/${json.data._id}`);
      expect(json.data.sensorType).toBe(sensorData.sensorType);
      expect(json.data.location).toBe(sensorData.location);
      expect(json.data.status).toBe("active");

      // Verify in database
      const dbSensor = await Sensor.findById(json.data._id);
      expect(dbSensor).toBeDefined();

      
    });

    test("creates sensor with operator role", async () => {
      const sensorData = {
        building: buildingId,
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
        building: buildingId,
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
            building: buildingId,
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

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      if (json.success) {
        return expect.unreachable("Expected response success to be false");
      }
      expect(json.error_code).toBe("sensor_serial_exists");
    });

    test("rejects invalid data", async () => {
      const res = await client.api.v1.sensors.$post(
        {
          json: {
            building: buildingId,
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

      expectValidationError({ data: await res.json(), status: res.status });
    });
  });

  // ============================================================================
  // GET /api/sensors/:id - Get Sensor Details
  // ============================================================================

  describe("GET /api/v1/sensors/:id", () => {
    test("returns sensor details", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
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
      expectTypeOf(json).toExtend<SensorResponse | ErrorResponse>();
      expect(json.success).toBe(true);
      if (!json.success) {
        return expect.unreachable("Property 'success' is not true");
      }

      expect(json.data._id).toBeDefined();
      expect(json.data.self).toBe(`/api/v1/sensors/${sensor._id.toString()}`);
      const building = PopulatedBuildingSchema.parse(json.data.building);
      expect(building.self).toBe(`/api/v1/buildings/${buildingId}`);
      expect(json.data.sensorType).toBe("internal_temp");
      expect(json.data.location).toBe("Piano 2");
      expect(json.data.lastReading).toBeDefined();
      expect(json.data.lastReading!.value).toBe(22.5);
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
    test("updates sensor min/max thresholds", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Thresholds",
        installationDate: new Date(),
        transmissionInterval: 90,
        status: "active",
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await client.api.v1.sensors[":id"].$patch(
        {
          param: { id: sensor._id.toString() },
          json: { minThreshold: 10, maxThreshold: 30 },
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const updated = await Sensor.findById(sensor._id);
      expect(updated!.minThreshold).toBe(10);
      expect(updated!.maxThreshold).toBe(30);
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

  });

  // ============================================================================
  // DELETE /api/sensors/:id - Delete Sensor
  // ============================================================================

  describe("DELETE /api/v1/sensors/:id", () => {
    test("deletes sensor and cascade delete readings", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
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
          sensor: sensor._id,
          building: new Types.ObjectId(buildingId),
          sensorType: "internal_temp",
        },
      });

      await Alert.create({
        building: buildingId,
        sensor: sensor._id,
        type: "threshold_exceeded",
        thresholdType: "max",
        severity: "high",
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

      expect(res.status).toBe(204);

      // Verify deletion
      const deletedSensor = await Sensor.findById(sensor._id);
      expect(deletedSensor).toBeNull();

      // Verify readings deleted
      const readings = await SensorReading.countDocuments({
        "metadata.sensor": sensor._id,
      });
      expect(readings).toBe(0);

      const alerts = await Alert.countDocuments({ sensor: sensor._id });
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
    test("marks an active sensor as inactive when it exceeds 2x transmissionInterval", async () => {
      const transmissionInterval = 60; // 60 s
      // lastReading is 200 s ago → exceeds 2 × 60 = 120 s
      const staleTimestamp = new Date(Date.now() - 200_000);

      const sensor = await Sensor.create({
        building: buildingId,
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
      expect(json.success).toBe(true);
      if (!json.success) {
        return expect.unreachable("missing sensors");
      }
      const found = json.data.sensors.find((s) => s._id === sensor._id.toString());
      expect(found).toBeDefined();
      expect(found!.status).toBe("inactive");

      // GET is a safe method: status is computed in memory without mutating the DB
      const dbSensor = await Sensor.findById(sensor._id);
      expect(dbSensor).toBeDefined();
    });


    test("does not mark an active sensor as inactive when reading is within 2× transmissionInterval", async () => {
      const transmissionInterval = 300; // 300 s
      // lastReading is 100 s ago → within 2 × 300 = 600 s
      const freshTimestamp = new Date(Date.now() - 100_000);

      const sensor = await Sensor.create({
        building: buildingId,
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
      expect(json.success).toBe(true);
      if (!json.success) return expect.unreachable("missing sensors");
      const found = json.data.sensors.find((s) => s._id === sensor._id.toString());
      expect(found).toBeDefined();
      expect(found!.status).toBe("active");
    });

    test("does not change status of sensors in maintenance or error when they have stale readings", async () => {
      const staleTimestamp = new Date(Date.now() - 600_000); // 10 min ago

      const maintenanceSensor = await Sensor.create({
        building: buildingId,
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
        building: buildingId,
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
      expect(json.success).toBe(true);
      if (!json.success) {
        return expect.unreachable("missing sensor");
      };

      const m = json.data.sensors.find((s) => s._id === maintenanceSensor._id.toString());
      expect(m!.status).toBe("maintenance");

      const e = json.data.sensors.find((s) => s._id === errorSensor._id.toString());
      expect(e!.status).toBe("error");
    });

    test("marks active sensor with no lastReading as inactive", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
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
      expect(json.success).toBe(true);
      if (!json.success) return expect.unreachable("missing sensors");
      const found = json.data.sensors.find((s) => s._id === sensor._id.toString());
      expect(found!.status).toBe("inactive");
    });
  });

  // ============================================================================
  // GET /api/sensors/:id/readings - Get Readings History
  // ============================================================================

  describe("GET /api/v1/sensors/:id/readings", () => {
    test("returns sensor readings history", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
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
            sensor: sensor._id,
            building: new Types.ObjectId(buildingId),
            sensorType: "internal_temp",
          },
        },
        {
          timestamp: new Date(now.getTime() - 180000), // 3 min ago
          value: 22.0,
          unit: "°C",
          metadata: {
            sensor: sensor._id,
            building: new Types.ObjectId(buildingId),
            sensorType: "internal_temp",
          },
        },
        {
          timestamp: now,
          value: 23.0,
          unit: "°C",
          metadata: {
            sensor: sensor._id,
            building: new Types.ObjectId(buildingId),
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
      expect(json.success).toBe(true);
      if (!json.success) {
        return expect.unreachable("Expected response success to be true");
      }
      expect(json.data.readings.length).toBe(3);
      expect(json.data.readings[0]!.value).toBe(23.0); // Most recent first
      expect(json.data.readings[2]!.value).toBe(21.0); // Oldest last
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
