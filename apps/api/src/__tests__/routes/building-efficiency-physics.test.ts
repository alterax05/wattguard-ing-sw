import {
  describe,
  test,
  expect,
  beforeEach,
  expectTypeOf,
} from "bun:test";

import { testClient } from "hono/testing";
import { z } from "zod";
import mongoose from "mongoose";
import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";
import { ErrorSchema } from "@wattguard/shared";
import type { GetBuildingEfficiencyResponse } from "@wattguard/shared";

type ErrorResponse = z.infer<typeof ErrorSchema>;

const client = testClient(app);
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";

// Suppress console logs during tests

let adminToken: string;
let adminUserId: mongoose.Types.ObjectId;
let buildingTypeId: mongoose.Types.ObjectId;
let buildingId: string;
let energySensor;
let tempSensor;
let extSensor;

setupIntegrationTests();


beforeEach(async () => {

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
  adminUserId = admin._id;

  // Login to get token
  const loginRes = await client.api.v1.auth.session.$post({
    json: {
      email: "admin@test.com",
      password: "admin123",
    },
  });

  const cookie = loginRes.headers.get("set-cookie");
  const tokenMatch = cookie?.match(/access_token=([^;]+)/);
  if (!tokenMatch) return expect.unreachable("Admin token not found");
  // SAFETY: the access_token regex has a capture group, so group 1 is present once the match succeeds.
  adminToken = tokenMatch[1] as string;

  // Create Fixtures
  const buildingType = await BuildingType.create({ name: "Residential" });
  buildingTypeId = buildingType._id;

  const building = await Building.create({
    name: "Efficiency Test Building",
    address: "123 Energy St",
    surface: 100, // Surface is 100 m²
    buildingType: buildingTypeId,
    heatingSystemType: "electric",
    geographicZone: "Zone A",
    location: { type: "Point", coordinates: [11.1167, 46.0667] },
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
  buildingId = building._id.toString();

  // Create Sensors
  energySensor = await Sensor.create({
    building: building._id,
    sensorType: "energy_meter",
    location: "Basement",
    installationDate: new Date(),
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });

  tempSensor = await Sensor.create({
    building: building._id,
    sensorType: "internal_temp",
    location: "Living Room",
    installationDate: new Date(),
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });

  extSensor = await Sensor.create({
    building: building._id,
    sensorType: "external_temp",
    location: "Outside",
    installationDate: new Date(),
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });

  // Seed Readings with Physics-Compliant Data
  const baseTime = new Date("2024-01-01T10:00:00Z");
  
  // Physics Parameters for Simulation
  const SURF = 100; // m2
  const HEIGHT = 3.0; // m
  const VOL = SURF * HEIGHT;
  const C = VOL * 1.225 * 1005; // ~369,337 J/K
  const H_TRUE = 50.0; // W/K (Target Heat Loss)
  const COP_TRUE = 3.0; // Target Efficiency
  const EXT_TEMP = 5.0; // °C

  let currentTemp = 22.0;
  const readings = [];
  
  // Crank-Nicolson Step Function
  // Solve for T_new: C*(T_new-T_old)/dt = NetPower( (T_new+T_old)/2 )
  // NetPower = P_in - H * (T_avg - T_ext)
  const evolveTemp = (t_old: number, dt: number, p_in: number) => {
    // (C/dt) * (T_new - T_old) = P_in - H * ( (T_new + T_old)/2 - T_ext )
    // T_new * (C/dt + H/2) = T_old * (C/dt - H/2) + P_in + H*T_ext
    const alpha = C / dt;
    const beta = H_TRUE / 2;
    const t_new = (t_old * (alpha - beta) + p_in + H_TRUE * EXT_TEMP) / (alpha + beta);
    return t_new;
  };

  // 1. Cooling Phase (2 hours, 8 intervals of 15m)
  for (let i = 0; i < 8; i++) {
    const timestamp = new Date(baseTime.getTime() + i * 15 * 60 * 1000);
    
    readings.push({
      timestamp,
      value: 0, // Power OFF
      unit: "W",
      metadata: { sensor: energySensor._id, building: building._id, sensorType: "energy_meter" },
    });
    
    readings.push({
      timestamp,
      value: currentTemp,
      unit: "°C",
      metadata: { sensor: tempSensor._id, building: building._id, sensorType: "internal_temp" },
    });
    
    readings.push({
      timestamp,
      value: EXT_TEMP,
      unit: "°C",
      metadata: { sensor: extSensor._id, building: building._id, sensorType: "external_temp" },
    });

    // Evolve
    currentTemp = evolveTemp(currentTemp, 15 * 60, 0);
  }

  // 2. Heating Phase (2 hours, 8 intervals)
  // Heater ON (1000 W input -> 3000 W output)
  // API calculates COP = (Stored + Loss) / P_electric
  // We simulate: Stored + Loss = P_electric * COP_TRUE
  const P_ELEC = 1000;
  const P_THERMAL = P_ELEC * COP_TRUE;

  for (let i = 8; i <= 16; i++) {
    const timestamp = new Date(baseTime.getTime() + i * 15 * 60 * 1000);
    
    readings.push({
      timestamp,
      value: P_ELEC,
      unit: "W",
      metadata: { sensor: energySensor._id, building: building._id, sensorType: "energy_meter" },
    });
    
    readings.push({
      timestamp,
      value: currentTemp,
      unit: "°C",
      metadata: { sensor: tempSensor._id, building: building._id, sensorType: "internal_temp" },
    });
    
    readings.push({
      timestamp,
      value: EXT_TEMP,
      unit: "°C",
      metadata: { sensor: extSensor._id, building: building._id, sensorType: "external_temp" },
    });

    // Evolve
    currentTemp = evolveTemp(currentTemp, 15 * 60, P_THERMAL);
  }

  await SensorReading.insertMany(readings);
});

describe("GET /api/v1/buildings/:id/efficiency", () => {
  test("GET /api/v1/buildings/:id/efficiency - should calculate efficiency correctly", async () => {
    // 4 hours total duration
    const startDate = "2024-01-01T10:00:00Z";
    const endDate = new Date(new Date(startDate).getTime() + 4.5 * 60 * 60 * 1000).toISOString();

    const res = await client.api.v1.buildings[":id"].efficiency.$get(
      {
        param: { id: buildingId },
        query: { startDate, endDate },
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expectTypeOf(json).toExtend<GetBuildingEfficiencyResponse | ErrorResponse>();

    expect(json.success).toBe(true);
    if (!json.success) return expect.unreachable("Expected response to be successful");

    // Verify Physics Metrics

    // 1. Estimated Heat Loss Coefficient (H)
    // Should be close to 50
    expect(json.data.metrics.estimatedHeatLossCoefficient).not.toBeNull();
    expect(json.data.metrics.estimatedHeatLossCoefficient).toBeGreaterThan(40);
    expect(json.data.metrics.estimatedHeatLossCoefficient).toBeLessThan(60);

    // 2. Average COP (Device Efficiency)
    // Should be close to 3.0
    expect(json.data.metrics.averageCop).not.toBeNull();
    expect(json.data.metrics.averageCop).toBeCloseTo(3.0, 0); 
    expect(json.data.metrics.averageCop).toBeGreaterThan(2.5);
    expect(json.data.metrics.averageCop).toBeLessThan(3.5);
  });

  test("returns 400 for invalid dates", async () => {
    const res = await client.api.v1.buildings[":id"].efficiency.$get(
      {
        param: { id: buildingId },
        query: { startDate: "invalid", endDate: "invalid" },
      },
      {
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      }
    );

    expect(res.status).toBe(400);
  });

  test("returns 404 for non-existent building", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const startDate = "2024-01-01T10:00:00Z";
    const endDate = "2024-01-01T13:00:00Z";

    const res = await client.api.v1.buildings[":id"].efficiency.$get(
      {
        param: { id: fakeId },
        query: { startDate, endDate },
      },
      {
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      }
    );

    expect(res.status).toBe(404);
  });
});
