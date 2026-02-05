import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";

// Suppress console logs during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

let adminToken: string;
let adminUserId: string;
let buildingTypeId: string;
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

  // Create admin user
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

  // Login to get token
  const loginRes = await app.request("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@test.com",
      password: "admin123",
    }),
  });

  const cookie = loginRes.headers.get("set-cookie");
  const tokenMatch = cookie?.match(/access_token=([^;]+)/);
  if (!tokenMatch) throw new Error("Admin token not found");
  adminToken = tokenMatch[1] as string;

  // Create Fixtures
  const buildingType = await BuildingType.create({ name: "Residential" });
  buildingTypeId = buildingType._id.toString();

  const building = await Building.create({
    name: "Efficiency Test Building",
    address: "123 Energy St",
    surface: 100, // Surface is 100 m²
    buildingType: buildingTypeId,
    heatingSystemType: "electric",
    geographicZone: "Zone A",
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
  buildingId = building._id.toString();

  // Create Sensors
  const energySensor = await Sensor.create({
    buildingId: building._id,
    sensorType: "energy_meter",
    location: "Basement",
    installationDate: new Date(),
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });

  const tempSensor = await Sensor.create({
    buildingId: building._id,
    sensorType: "internal_temp",
    location: "Living Room",
    installationDate: new Date(),
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });

  const extSensor = await Sensor.create({
    buildingId: building._id,
    sensorType: "external_temp",
    location: "Outside",
    installationDate: new Date(),
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });

  // Seed Readings
  const baseTime = new Date("2024-01-01T10:00:00Z");

  // Energy: Constant 10kW for 2 hours -> 20kWh
  // 10kW at T0, T+1h, T+2h
  await SensorReading.create([
    {
      timestamp: baseTime,
      value: 10000, // 10kW (unit W)
      unit: "W",
      metadata: { sensorId: energySensor._id, buildingId: building._id, sensorType: "energy_meter" },
    },
    {
      timestamp: new Date(baseTime.getTime() + 3600000), // +1h
      value: 10000,
      unit: "W",
      metadata: { sensorId: energySensor._id, buildingId: building._id, sensorType: "energy_meter" },
    },
    {
      timestamp: new Date(baseTime.getTime() + 7200000), // +2h
      value: 10000,
      unit: "W",
      metadata: { sensorId: energySensor._id, buildingId: building._id, sensorType: "energy_meter" },
    },
  ]);

  // Internal Temp: Rise from 20°C to 22°C over 2 hours
  await SensorReading.create([
    {
      timestamp: baseTime,
      value: 20.0,
      unit: "°C",
      metadata: { sensorId: tempSensor._id, buildingId: building._id, sensorType: "internal_temp" },
    },
    {
      timestamp: new Date(baseTime.getTime() + 7200000), // +2h
      value: 22.0,
      unit: "°C",
      metadata: { sensorId: tempSensor._id, buildingId: building._id, sensorType: "internal_temp" },
    },
  ]);

  // External Temp
  await SensorReading.create([
    {
      timestamp: baseTime,
      value: 5.0,
      unit: "°C",
      metadata: { sensorId: extSensor._id, buildingId: building._id, sensorType: "external_temp" },
    },
  ]);
});

describe("Building Efficiency Route - Integration Tests", () => {
  test("GET /api/buildings/:id/efficiency - should calculate efficiency correctly", async () => {
    const startDate = "2024-01-01T10:00:00Z";
    const endDate = "2024-01-01T13:00:00Z";

    const res = await app.request(
      `/api/buildings/${buildingId}/efficiency?startDate=${startDate}&endDate=${endDate}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    
    expect(json.metrics).toBeDefined();

    // Energy: 20 kWh
    expect(json.metrics.totalEnergyConsumed).toBe(20.0);

    // Temp Delta: 22 - 20 = 2.0 °C
    expect(json.metrics.temperatureChange).toBe(2.0);

    // Efficiency:
    // Energy / (Delta T * Surface)
    // 20 / (2.0 * 100) = 20 / 200 = 0.1
    expect(json.metrics.efficiencyIndex).toBe(0.1);

    // Theoretical COP:
    // Avg Internal = (20 + 22) / 2 = 21 °C = 294.15 K
    // Avg External = 5 °C = 278.15 K
    // COP = 294.15 / (294.15 - 278.15) = 294.15 / 16 = 18.38
    expect(json.metrics.theoreticalCop).toBeCloseTo(18.38, 1);
  });

  test("should return 400 for invalid dates", async () => {
    const res = await app.request(
      `/api/buildings/${buildingId}/efficiency?startDate=invalid&endDate=invalid`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      }
    );

    expect(res.status).toBe(400);
  });

  test("should return 404 for non-existent building", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const startDate = "2024-01-01T10:00:00Z";
    const endDate = "2024-01-01T13:00:00Z";

    const res = await app.request(
      `/api/buildings/${fakeId}/efficiency?startDate=${startDate}&endDate=${endDate}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      }
    );

    expect(res.status).toBe(404);
  });
});
