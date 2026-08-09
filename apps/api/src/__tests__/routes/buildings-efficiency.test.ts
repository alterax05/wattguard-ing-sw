/**
 * Comprehensive integration tests for GET /api/buildings/:id/efficiency
 *
 * The efficiency endpoint computes physics-based thermal metrics:
 *   - totalEnergyConsumed  (kWh)
 *   - averageExternalTemperature (°C) — sensor readings or Open-Meteo fallback
 *   - estimatedHeatLossCoefficient  H  (W/K)
 *   - insulationQuality              H / surface  (W/m²·K)
 *   - averageCop                     Coefficient of Performance
 *
 * Scenarios covered
 * -----------------
 *  1.  Authentication — 401 without token
 *  2.  Not Found — 404 for unknown building ID
 *  3.  Bad request — 400 for missing / malformed query params
 *  4.  No sensor data at all — 200 with zeroed / null metrics, no crash
 *  5.  Electric building — full sensor suite → COP + H computed
 *  6.  Electric building without external_temp sensor →
 *        weather API fallback populates avgExternal for the physics loop
 *        so COP and H are still computed (regression test for the bug fix)
 *  7.  Gas boiler building — totalEnergyConsumed derived from m³ readings × LHV
 *  8.  District heating — averageCop is always null regardless of data
 *  9.  Insulation quality — correctly derived as avgH / surface
 * 10.  averageExternalTemperature prefers sensor data over weather API
 * 11.  Weather API unavailable — graceful null fallback, no crash
 * 12.  Only cooling phases present — H estimated, averageCop null
 * 13.  Mixed cooling then heating — two-pass COP computation
 * 14.  Fewer than 2 per-minute buckets — all physics metrics null
 * 15.  Response envelope — all required fields present
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import mongoose from "mongoose";

// ── Weather mock — must be declared BEFORE the app import so the route
//    module receives the mocked version when it is first evaluated.
// ─────────────────────────────────────────────────────────────────────────────
//
// `mockWeatherFn` is a variable that individual tests can overwrite to control
// what the weather API "returns".  By default it returns a real-ish 5°C.
let mockWeatherImpl: () => Promise<number | null> = async () => 5.0;

mock.module("../../lib/weather", () => ({
  getAverageHistoricalTemperature: mock(() => mockWeatherImpl()),
  getCoordinates: mock(async () => null),
}));

// ── App and test helpers (imported AFTER the module mock is registered) ──────
import { app } from "../../index";
import { testClient } from "hono/testing";
import { expectTypeOf } from "bun:test";
import { z } from "zod";
import { ErrorSchema } from "@wattguard/shared";
import type { GetBuildingEfficiencyResponse } from "@wattguard/shared";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";

// ── silence console noise during tests ──────────────────────────────────────
const originalLog = console.log;
const originalError = console.error;

// ── shared state ─────────────────────────────────────────────────────────────
let adminToken: string;
let adminUserId: mongoose.Types.ObjectId;
let buildingTypeId: mongoose.Types.ObjectId;

// ── physics constants (must mirror the handler) ───────────────────────────────
const GAS_LHV_KWH_PER_M3 = 10.55;

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build an ISO datetime string offset by `offsetMs` from `base`. */
function ts(base: Date, offsetMs: number): string {
  return new Date(base.getTime() + offsetMs).toISOString();
}

/** Short alias to make SensorReading payloads terse. */
function mkReading(
  timestamp: Date,
  value: number,
  unit: string,
  sensorType: string,
  sensorId: string,
  buildingId: string,
) {
  return { timestamp, value, unit, metadata: { sensorId, buildingId, sensorType } };
}

type ErrorResponse = z.infer<typeof ErrorSchema>;

const client = testClient(app);

/** POST to the efficiency endpoint and return { status, json }. */
async function getEfficiency(
  buildingId: string,
  startDate: string,
  endDate: string,
  token: string = adminToken,
) {
  const res = await client.api.buildings[":id"].efficiency.$get(
    { param: { id: buildingId }, query: { startDate, endDate } },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return { status: res.status, json: await res.json() };
}

// ── lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  console.log = () => {};
  console.error = () => {};
  await connectTestDB();
});

afterAll(async () => {
  console.log = originalLog;
  console.error = originalError;
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();

  // Reset weather mock to a sensible default before each test
  mockWeatherImpl = async () => 5.0;

  // Create admin user
  const hash = await Bun.password.hash("admin123", { algorithm: "bcrypt", cost: 10 });
  const admin = await User.create({ email: "admin@test.com", role: "admin", passwordHash: hash });
  adminUserId = admin._id as mongoose.Types.ObjectId;

  // Log in
  const loginRes = await app.request("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@test.com", password: "admin123" }),
  });
  const cookie = loginRes.headers.get("set-cookie") ?? "";
  const match = cookie.match(/access_token=([^;]+)/);
  if (!match) throw new Error("Admin token not found in login response");
  adminToken = match[1]!;

  // Create a building type
  const bt = await BuildingType.create({ name: "TestType", description: "For testing" });
  buildingTypeId = bt._id as mongoose.Types.ObjectId;
});

// ── factory: create a minimal active building ─────────────────────────────────
async function createBuilding(overrides: Partial<{
  heatingSystemType: string;
  surface: number;
  ceilingHeight: number;
}> = {}) {
  return Building.create({
    name: "Test Building",
    address: "Via Test 1, Milano",
    geographicZone: "Centro",
    buildingType: buildingTypeId,
    surface: overrides.surface ?? 500,
    ceilingHeight: overrides.ceilingHeight ?? 3.0,
    constructionYear: 2000,
    heatingSystemType: overrides.heatingSystemType ?? "pompa_calore",
    location: { type: "Point", coordinates: [11.1167, 46.0667] },
    status: "active",
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
}

/** Create a sensor attached to `buildingId`. */
async function createSensor(
  buildingId: string,
  sensorType: "internal_temp" | "external_temp" | "energy_meter" | "gas_meter",
) {
  return Sensor.create({
    buildingId,
    sensorType,
    location: "Test Location",
    installationDate: new Date(),
    status: "active",
    transmissionInterval: 90,
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/buildings/:id/efficiency — Comprehensive Tests", () => {

  // ── 1. Authentication ───────────────────────────────────────────────────────
  describe("1. Authentication", () => {
    test("returns 401 without a token", async () => {
      const building = await createBuilding();
      const now = new Date();
      const res = await app.request(
        `/api/buildings/${building._id}/efficiency?startDate=${ts(now, -3_600_000)}&endDate=${now.toISOString()}`,
      );
      expect(res.status).toBe(401);
    });
  });

  // ── 2. Not Found ────────────────────────────────────────────────────────────
  describe("2. Not Found", () => {
    test("returns 404 for a non-existent building ID", async () => {
      const fakeId = "507f1f77bcf86cd799439011";
      const now = new Date();
      const { status } = await getEfficiency(fakeId, ts(now, -3_600_000), now.toISOString());
      expect(status).toBe(404);
    });
  });

  // ── 3. Bad Request ──────────────────────────────────────────────────────────
  describe("3. Bad Request", () => {
    test("returns 400 when startDate is missing", async () => {
      const building = await createBuilding();
      const now = new Date();
      const res = await app.request(
        `/api/buildings/${building._id}/efficiency?endDate=${now.toISOString()}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(res.status).toBe(400);
    });

    test("returns 400 when endDate is missing", async () => {
      const building = await createBuilding();
      const now = new Date();
      const res = await app.request(
        `/api/buildings/${building._id}/efficiency?startDate=${now.toISOString()}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(res.status).toBe(400);
    });

    test("returns 400 when startDate is not a valid ISO datetime", async () => {
      const building = await createBuilding();
      const now = new Date();
      const res = await app.request(
        `/api/buildings/${building._id}/efficiency?startDate=not-a-date&endDate=${now.toISOString()}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(res.status).toBe(400);
    });
  });

  // ── 4. No sensor data ───────────────────────────────────────────────────────
  describe("4. No sensor data at all", () => {
    test("returns 200 with zero energy and null physics metrics", async () => {
      const building = await createBuilding();
      const now = new Date();

      // weather returns 5°C (default mock)
      const { status, json } = await getEfficiency(
        building._id.toString(),
        ts(now, -3_600_000),
        now.toISOString(),
      );

      expect(status).toBe(200);
      expectTypeOf(json).toExtend<GetBuildingEfficiencyResponse | ErrorResponse>();
      if (!("metrics" in json)) {
        throw new Error("Expected response to contain 'metrics'");
      }
      expect(json.metrics.totalEnergyConsumed).toBe(0);
      expect(json.metrics.estimatedHeatLossCoefficient).toBeNull();
      expect(json.metrics.insulationQuality).toBeNull();
      expect(json.metrics.averageCop).toBeNull();
      // weather fallback supplies the external temperature
      expect(json.metrics.averageExternalTemperature).toBe(5.0);
    });
  });

  // ── 5. Electric building — full sensor suite ────────────────────────────────
  describe("5. Electric building with internal + external temp + energy meter", () => {
    test("computes COP and heat-loss coefficient from sensor data", async () => {
      const surface = 400;
      const building = await createBuilding({ surface, heatingSystemType: "pompa_calore" });
      const bid = building._id.toString();

      const iSensor = await createSensor(bid, "internal_temp");
      const eSensor = await createSensor(bid, "external_temp");
      const pSensor = await createSensor(bid, "energy_meter");

      const sid_i = iSensor._id.toString();
      const sid_e = eSensor._id.toString();
      const sid_p = pSensor._id.toString();

      // Cooling phase (minutes 0–4): heater off, temperature falls
      // Heating phase (minutes 4–8): heater on at 2 kW, temperature rises
      const t0  = new Date("2025-01-15T10:00:00.000Z");
      const MIN = 60_000;

      const readings: object[] = [];

      const coolingTemps = [22.0, 21.75, 21.5, 21.25, 21.0];
      for (let i = 0; i < coolingTemps.length; i++) {
        const t = new Date(t0.getTime() + i * MIN);
        readings.push(mkReading(t, coolingTemps[i]!, "°C", "internal_temp", sid_i, bid));
        readings.push(mkReading(t, 5.0,               "°C", "external_temp", sid_e, bid));
        readings.push(mkReading(t, 0.0,               "kW", "energy_meter",  sid_p, bid));
      }

      const heatingTemps = [21.0, 21.3, 21.6, 21.9, 22.2];
      for (let i = 1; i < heatingTemps.length; i++) {
        const t = new Date(t0.getTime() + (4 + i) * MIN);
        readings.push(mkReading(t, heatingTemps[i]!, "°C", "internal_temp", sid_i, bid));
        readings.push(mkReading(t, 5.0,               "°C", "external_temp", sid_e, bid));
        readings.push(mkReading(t, 2.0,               "kW", "energy_meter",  sid_p, bid));
      }
      await SensorReading.insertMany(readings);

      // External sensor present → weather API must NOT be called
      mockWeatherImpl = async () => { throw new Error("weather API must not be called"); };

      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 9 * MIN));

      // restore
      mockWeatherImpl = async () => 5.0;

      expect(status).toBe(200);
      if (!("metrics" in json)) throw new Error("missing metrics");
      const m = json.metrics;

      expect(m.totalEnergyConsumed).toBeGreaterThan(0);
      expect(m.averageExternalTemperature).toBeCloseTo(5.0, 0);
      expect(m.estimatedHeatLossCoefficient).not.toBeNull();
      expect(m.estimatedHeatLossCoefficient).toBeGreaterThan(0);
      expect(m.insulationQuality).not.toBeNull();
      expect(m.insulationQuality).toBeCloseTo(m.estimatedHeatLossCoefficient! / surface, 1);
      expect(m.averageCop).not.toBeNull();
      expect(m.averageCop).toBeGreaterThan(0);
    });
  });

  // ── 6. Electric building WITHOUT external_temp sensor (weather API fallback) ─
  describe("6. Electric building without external_temp sensor", () => {
    test("weather API temperature used in physics loop — COP and H are non-null", async () => {
      const surface = 300;
      const building = await createBuilding({ surface, heatingSystemType: "pompa_calore" });
      const bid = building._id.toString();

      // NO external_temp sensor — weather API must supply temperature
      const iSensor = await createSensor(bid, "internal_temp");
      const pSensor = await createSensor(bid, "energy_meter");
      const sid_i = iSensor._id.toString();
      const sid_p = pSensor._id.toString();

      const WEATHER_TEMP = 3.0;
      let weatherCallCount = 0;
      mockWeatherImpl = async () => { weatherCallCount++; return WEATHER_TEMP; };

      const t0  = new Date("2025-01-15T12:00:00.000Z");
      const MIN = 60_000;

      const readings: object[] = [];
      const coolingTemps = [22.0, 21.75, 21.5, 21.25, 21.0];
      for (let i = 0; i < coolingTemps.length; i++) {
        const t = new Date(t0.getTime() + i * MIN);
        readings.push(mkReading(t, coolingTemps[i]!, "°C", "internal_temp", sid_i, bid));
        readings.push(mkReading(t, 0.0,               "kW", "energy_meter",  sid_p, bid));
      }
      const heatingTemps = [21.0, 21.4, 21.8, 22.2, 22.6];
      for (let i = 1; i < heatingTemps.length; i++) {
        const t = new Date(t0.getTime() + (4 + i) * MIN);
        readings.push(mkReading(t, heatingTemps[i]!, "°C", "internal_temp", sid_i, bid));
        readings.push(mkReading(t, 2.0,               "kW", "energy_meter",  sid_p, bid));
      }
      await SensorReading.insertMany(readings);

      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 9 * MIN));

      expect(status).toBe(200);
      if (!("metrics" in json)) throw new Error("missing metrics");
      const m = json.metrics;

      // The weather API must have been called (no sensor data)
      expect(weatherCallCount).toBeGreaterThan(0);

      // averageExternalTemperature from weather fallback
      expect(m.averageExternalTemperature).toBe(WEATHER_TEMP);

      // Critical assertions — these were null before the bug fix
      expect(m.estimatedHeatLossCoefficient).not.toBeNull();
      expect(m.estimatedHeatLossCoefficient).toBeGreaterThan(0);
      expect(m.averageCop).not.toBeNull();
      expect(m.averageCop).toBeGreaterThan(0);
    });

    test("weather API called only once — result reused for the response field", async () => {
      const building = await createBuilding({ heatingSystemType: "pompa_calore" });
      const bid = building._id.toString();

      let weatherCallCount = 0;
      mockWeatherImpl = async () => { weatherCallCount++; return 4.0; };

      const iSensor = await createSensor(bid, "internal_temp");
      const t0  = new Date("2025-01-15T08:00:00.000Z");
      const MIN = 60_000;
      await SensorReading.insertMany([
        mkReading(t0,                            22.0, "°C", "internal_temp", iSensor._id.toString(), bid),
        mkReading(new Date(t0.getTime() + MIN),  21.8, "°C", "internal_temp", iSensor._id.toString(), bid),
      ]);

      await getEfficiency(bid, ts(t0, 0), ts(t0, 2 * MIN));

      // The weather API should be called at most once — the handler reuses
      // `weatherFallbackExtTemp` for the response field (no double fetch)
      expect(weatherCallCount).toBeLessThanOrEqual(1);
    });
  });

  // ── 7. Gas boiler — totalEnergyConsumed from m³ × LHV ──────────────────────
  describe("7. Gas boiler building", () => {
    test("computes totalEnergyConsumed from cumulative gas meter readings × LHV", async () => {
      const building = await createBuilding({ heatingSystemType: "caldaia_gas" });
      const bid = building._id.toString();

      const gasSensor = await createSensor(bid, "gas_meter");
      const sid_g = gasSensor._id.toString();

      const t0  = new Date("2025-01-20T06:00:00.000Z");
      const MIN = 60_000;

      // Cumulative m³: starts at 100, ends at 110 → 10 m³ consumed
      const gasValues = [100, 102, 105, 107, 110];
      const readings = gasValues.map((v, i) => ({
        timestamp: new Date(t0.getTime() + i * MIN),
        value: v,
        unit: "m³",
        metadata: { sensorId: sid_g, buildingId: bid, sensorType: "gas_meter" },
      }));
      await SensorReading.insertMany(readings);

      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 5 * MIN));

      expect(status).toBe(200);
      const expectedKWh = (110 - 100) * GAS_LHV_KWH_PER_M3; // 10 × 10.55 = 105.5
      if (!("metrics" in json)) {
        throw new Error("Expected response to contain 'metrics'");
      }
      expect(json.metrics.totalEnergyConsumed).toBeCloseTo(expectedKWh, 1);
    });

    test("gas meter reset (last < first) yields 0 totalEnergyConsumed", async () => {
      const building = await createBuilding({ heatingSystemType: "caldaia_gas" });
      const bid = building._id.toString();

      const gasSensor = await createSensor(bid, "gas_meter");
      const sid_g = gasSensor._id.toString();

      const t0  = new Date("2025-01-20T06:00:00.000Z");
      const MIN = 60_000;

      await SensorReading.insertMany([
        { timestamp: t0,                           value: 500, unit: "m³", metadata: { sensorId: sid_g, buildingId: bid, sensorType: "gas_meter" } },
        { timestamp: new Date(t0.getTime() + MIN), value: 10,  unit: "m³", metadata: { sensorId: sid_g, buildingId: bid, sensorType: "gas_meter" } },
      ]);

      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 2 * MIN));

      expect(status).toBe(200);
      // last (10) < first (500) → consumed = 0
      if (!("metrics" in json)) {
        throw new Error("Expected response to contain 'metrics'");
      }
      expect(json.metrics.totalEnergyConsumed).toBe(0);
    });
  });

  // ── 8. District heating — averageCop always null ────────────────────────────
  describe("8. District heating building", () => {
    test("averageCop is null for 'teleriscaldamento' even when data is present", async () => {
      const building = await createBuilding({ heatingSystemType: "teleriscaldamento" });
      const bid = building._id.toString();

      const iSensor = await createSensor(bid, "internal_temp");
      const eSensor = await createSensor(bid, "external_temp");
      const pSensor = await createSensor(bid, "energy_meter");

      const t0  = new Date("2025-01-15T10:00:00.000Z");
      const MIN = 60_000;

      const readings: object[] = [];
      for (let i = 0; i < 5; i++) {
        const t = new Date(t0.getTime() + i * MIN);
        readings.push(mkReading(t, 20 + i * 0.5, "°C", "internal_temp", iSensor._id.toString(), bid));
        readings.push(mkReading(t, 5.0,            "°C", "external_temp", eSensor._id.toString(), bid));
        readings.push(mkReading(t, 3.0,            "kW", "energy_meter",  pSensor._id.toString(), bid));
      }
      await SensorReading.insertMany(readings);

      mockWeatherImpl = async () => { throw new Error("weather must not be called"); };
      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 5 * MIN));
      mockWeatherImpl = async () => 5.0;

      expect(status).toBe(200);
      if (!("metrics" in json)) {
        throw new Error("Expected response to contain 'metrics'");
      }
      expect(json.metrics.averageCop).toBeNull();
    });

    test("averageCop is null for 'district_heating' keyword", async () => {
      const building = await createBuilding({ heatingSystemType: "district_heating" });
      const bid = building._id.toString();

      const iSensor = await createSensor(bid, "internal_temp");
      const eSensor = await createSensor(bid, "external_temp");
      const pSensor = await createSensor(bid, "energy_meter");

      const t0  = new Date("2025-01-15T10:00:00.000Z");
      const MIN = 60_000;

      const readings: object[] = [];
      for (let i = 0; i < 4; i++) {
        const t = new Date(t0.getTime() + i * MIN);
        readings.push(mkReading(t, 21 + i * 0.3, "°C", "internal_temp", iSensor._id.toString(), bid));
        readings.push(mkReading(t, 4.0,            "°C", "external_temp", eSensor._id.toString(), bid));
        readings.push(mkReading(t, 2.5,            "kW", "energy_meter",  pSensor._id.toString(), bid));
      }
      await SensorReading.insertMany(readings);

      mockWeatherImpl = async () => { throw new Error("weather must not be called"); };
      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 4 * MIN));
      mockWeatherImpl = async () => 5.0;

      expect(status).toBe(200);
      if (!("metrics" in json)) {
        throw new Error("Expected response to contain 'metrics'");
      }
      expect(json.metrics.averageCop).toBeNull();
    });
  });

  // ── 9. Insulation quality ───────────────────────────────────────────────────
  describe("9. Insulation quality", () => {
    test("insulationQuality equals estimatedHeatLossCoefficient / surface", async () => {
      const surface = 250;
      const building = await createBuilding({ surface, heatingSystemType: "pompa_calore" });
      const bid = building._id.toString();

      const iSensor = await createSensor(bid, "internal_temp");
      const eSensor = await createSensor(bid, "external_temp");
      const pSensor = await createSensor(bid, "energy_meter");

      const t0  = new Date("2025-02-01T08:00:00.000Z");
      const MIN = 60_000;

      // Pure cooling phase → H definitely estimated
      const internalTemps = [22.0, 21.6, 21.2, 20.8, 20.4];
      const readings: object[] = [];
      for (let i = 0; i < internalTemps.length; i++) {
        const t = new Date(t0.getTime() + i * MIN);
        readings.push(mkReading(t, internalTemps[i]!, "°C", "internal_temp", iSensor._id.toString(), bid));
        readings.push(mkReading(t, 5.0,               "°C", "external_temp", eSensor._id.toString(), bid));
        readings.push(mkReading(t, 0.0,               "kW", "energy_meter",  pSensor._id.toString(), bid));
      }
      await SensorReading.insertMany(readings);

      mockWeatherImpl = async () => { throw new Error("weather must not be called"); };
      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 5 * MIN));
      mockWeatherImpl = async () => 5.0;

      expect(status).toBe(200);
      if (!("metrics" in json)) throw new Error("missing metrics");
      const m = json.metrics;
      expect(m.estimatedHeatLossCoefficient).not.toBeNull();
      expect(m.insulationQuality).not.toBeNull();
      expect(m.insulationQuality).toBeCloseTo(m.estimatedHeatLossCoefficient! / surface, 1);
    });

    test("insulationQuality is null when H cannot be estimated (no temperature data)", async () => {
      const building = await createBuilding();
      const bid = building._id.toString();
      const pSensor = await createSensor(bid, "energy_meter");
      const t0  = new Date("2025-02-01T08:00:00.000Z");
      const MIN = 60_000;

      await SensorReading.insertMany([
        mkReading(t0,                            5.0, "kW", "energy_meter", pSensor._id.toString(), bid),
        mkReading(new Date(t0.getTime() + MIN),  5.0, "kW", "energy_meter", pSensor._id.toString(), bid),
      ]);

      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 2 * MIN));

      expect(status).toBe(200);
      if (!("metrics" in json)) {
        throw new Error("Expected response to contain 'metrics'");
      }
      expect(json.metrics.estimatedHeatLossCoefficient).toBeNull();
      expect(json.metrics.insulationQuality).toBeNull();
    });
  });

  // ── 10. Sensor external temp preferred over weather API ─────────────────────
  describe("10. External temperature source priority", () => {
    test("sensor-based averageExternalTemperature overrides weather API", async () => {
      const building = await createBuilding();
      const bid = building._id.toString();

      const iSensor = await createSensor(bid, "internal_temp");
      const eSensor = await createSensor(bid, "external_temp");

      const SENSOR_TEMP = 7.5;

      const t0  = new Date("2025-01-10T10:00:00.000Z");
      const MIN = 60_000;

      await SensorReading.insertMany([
        mkReading(t0,                           22.0,        "°C", "internal_temp", iSensor._id.toString(), bid),
        mkReading(t0,                           SENSOR_TEMP, "°C", "external_temp", eSensor._id.toString(), bid),
        mkReading(new Date(t0.getTime() + MIN), 21.8,        "°C", "internal_temp", iSensor._id.toString(), bid),
        mkReading(new Date(t0.getTime() + MIN), SENSOR_TEMP, "°C", "external_temp", eSensor._id.toString(), bid),
      ]);

      // Weather API must NOT be called when sensor data is available
      let weatherCallCount = 0;
      mockWeatherImpl = async () => { weatherCallCount++; return 99.0; };

      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 2 * MIN));

      expect(status).toBe(200);
      // Sensor data wins
      if (!("metrics" in json)) {
        throw new Error("Expected response to contain 'metrics'");
      }
      expect(json.metrics.averageExternalTemperature).toBeCloseTo(SENSOR_TEMP, 1);
      expect(weatherCallCount).toBe(0);
    });
  });

  // ── 11. Weather API unavailable ────────────────────────────────────────────
  describe("11. Weather API unavailable", () => {
    test("returns 200 with null averageExternalTemperature when weather API returns null", async () => {
      const building = await createBuilding();
      const bid = building._id.toString();

      // No external sensor — weather API fallback required
      const iSensor = await createSensor(bid, "internal_temp");
      const t0  = new Date("2025-01-10T10:00:00.000Z");
      const MIN = 60_000;

      await SensorReading.insertMany([
        mkReading(t0,                           22.0, "°C", "internal_temp", iSensor._id.toString(), bid),
        mkReading(new Date(t0.getTime() + MIN), 21.8, "°C", "internal_temp", iSensor._id.toString(), bid),
      ]);

      // Simulate API failure
      mockWeatherImpl = async () => null;

      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 2 * MIN));

      expect(status).toBe(200);
      // No external temp available → null
      if (!("metrics" in json)) {
        throw new Error("Expected response to contain 'metrics'");
      }
      expect(json.metrics.averageExternalTemperature).toBeNull();
      // Without tempDiff, H and COP remain null
      expect(json.metrics.estimatedHeatLossCoefficient).toBeNull();
      expect(json.metrics.averageCop).toBeNull();
    });
  });

  // ── 12. Only cooling phases ─────────────────────────────────────────────────
  describe("12. Only cooling phases (heater always off)", () => {
    test("H is estimated but averageCop is null (no heating data)", async () => {
      const building = await createBuilding({ heatingSystemType: "pompa_calore" });
      const bid = building._id.toString();

      const iSensor = await createSensor(bid, "internal_temp");
      const eSensor = await createSensor(bid, "external_temp");
      const pSensor = await createSensor(bid, "energy_meter");

      const t0  = new Date("2025-03-01T00:00:00.000Z");
      const MIN = 60_000;

      // Heater always off, temperature steadily falls
      const internalTemps = [23.0, 22.5, 22.0, 21.5, 21.0, 20.5];
      const readings: object[] = [];
      for (let i = 0; i < internalTemps.length; i++) {
        const t = new Date(t0.getTime() + i * MIN);
        readings.push(mkReading(t, internalTemps[i]!, "°C", "internal_temp", iSensor._id.toString(), bid));
        readings.push(mkReading(t, 5.0,               "°C", "external_temp", eSensor._id.toString(), bid));
        readings.push(mkReading(t, 0.0,               "kW", "energy_meter",  pSensor._id.toString(), bid));
      }
      await SensorReading.insertMany(readings);

      mockWeatherImpl = async () => { throw new Error("weather must not be called"); };
      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 6 * MIN));
      mockWeatherImpl = async () => 5.0;

      expect(status).toBe(200);
      if (!("metrics" in json)) throw new Error("missing metrics");
      const m = json.metrics;

      expect(m.estimatedHeatLossCoefficient).not.toBeNull();
      expect(m.estimatedHeatLossCoefficient).toBeGreaterThan(0);
      expect(m.insulationQuality).not.toBeNull();
      // No heating intervals → COP cannot be computed
      expect(m.averageCop).toBeNull();
    });
  });

  // ── 13. Mixed cooling then heating — two-pass COP computation ───────────────
  describe("13. Mixed cooling then heating — two-pass COP computation", () => {
    test("averageCop computed in second pass after H is determined", async () => {
      const building = await createBuilding({ heatingSystemType: "pompa_calore" });
      const bid = building._id.toString();

      const iSensor = await createSensor(bid, "internal_temp");
      const eSensor = await createSensor(bid, "external_temp");
      const pSensor = await createSensor(bid, "energy_meter");

      const t0  = new Date("2025-03-01T06:00:00.000Z");
      const MIN = 60_000;

      const readings: object[] = [];

      // Cooling phase (minutes 0–3): temp falls, heater off
      const coolingTemps = [22.0, 21.67, 21.33, 21.0];
      for (let i = 0; i < coolingTemps.length; i++) {
        const t = new Date(t0.getTime() + i * MIN);
        readings.push(mkReading(t, coolingTemps[i]!, "°C", "internal_temp", iSensor._id.toString(), bid));
        readings.push(mkReading(t, 4.0,               "°C", "external_temp", eSensor._id.toString(), bid));
        readings.push(mkReading(t, 0.0,               "kW", "energy_meter",  pSensor._id.toString(), bid));
      }

      // Heating phase (minutes 3–6): temp rises, heater at 3 kW
      const heatingTemps = [21.0, 21.5, 22.0, 22.5];
      for (let i = 1; i < heatingTemps.length; i++) {
        const t = new Date(t0.getTime() + (3 + i) * MIN);
        readings.push(mkReading(t, heatingTemps[i]!, "°C", "internal_temp", iSensor._id.toString(), bid));
        readings.push(mkReading(t, 4.0,               "°C", "external_temp", eSensor._id.toString(), bid));
        readings.push(mkReading(t, 3.0,               "kW", "energy_meter",  pSensor._id.toString(), bid));
      }
      await SensorReading.insertMany(readings);

      mockWeatherImpl = async () => { throw new Error("weather must not be called"); };
      const { status, json } = await getEfficiency(bid, ts(t0, 0), ts(t0, 7 * MIN));
      mockWeatherImpl = async () => 5.0;

      expect(status).toBe(200);
      if (!("metrics" in json)) throw new Error("missing metrics");
      const m = json.metrics;
      expect(m.estimatedHeatLossCoefficient).not.toBeNull();
      // COP requires avgH from the first pass — must be non-null
      expect(m.averageCop).not.toBeNull();
      expect(m.averageCop).toBeGreaterThan(0);
    });
  });

  // ── 14. Fewer than 2 per-minute buckets → all physics null ──────────────────
  describe("14. Insufficient time-series data (< 2 buckets)", () => {
    test("single data point → null for H, insulationQuality, and COP", async () => {
      const building = await createBuilding();
      const bid = building._id.toString();

      const iSensor = await createSensor(bid, "internal_temp");
      const t0 = new Date("2025-01-15T10:00:00.000Z");

      await SensorReading.insertMany([
        mkReading(t0, 22.0, "°C", "internal_temp", iSensor._id.toString(), bid),
      ]);

      const { status, json } = await getEfficiency(bid, ts(t0, -60_000), ts(t0, 60_000));

      expect(status).toBe(200);
      if (!("metrics" in json)) {
        throw new Error("Expected response to contain 'metrics'");
      }
      expect(json.metrics.estimatedHeatLossCoefficient).toBeNull();
      expect(json.metrics.insulationQuality).toBeNull();
      expect(json.metrics.averageCop).toBeNull();
    });

    test("two readings within the same minute collapse to one bucket → physics null", async () => {
      const building = await createBuilding();
      const bid = building._id.toString();

      const iSensor = await createSensor(bid, "internal_temp");
      const eSensor = await createSensor(bid, "external_temp");
      const t0 = new Date("2025-01-15T10:00:00.000Z");

      // Both readings land in the same 1-minute bucket
      await SensorReading.insertMany([
        mkReading(t0,                             22.0, "°C", "internal_temp", iSensor._id.toString(), bid),
        mkReading(new Date(t0.getTime() + 30_000), 22.1, "°C", "internal_temp", iSensor._id.toString(), bid),
        mkReading(t0,                             5.0,  "°C", "external_temp", eSensor._id.toString(), bid),
      ]);

      const { status, json } = await getEfficiency(bid, ts(t0, -60_000), ts(t0, 60_000));

      expect(status).toBe(200);
      if (!("metrics" in json)) {
        throw new Error("Expected response to contain 'metrics'");
      }
      expect(json.metrics.estimatedHeatLossCoefficient).toBeNull();
      expect(json.metrics.averageCop).toBeNull();
    });
  });

  // ── 15. Response envelope ───────────────────────────────────────────────────
  describe("15. Response envelope", () => {
    test("response contains all required top-level fields", async () => {
      const building = await createBuilding();
      const bid = building._id.toString();
      const now = new Date();

      const { status, json } = await getEfficiency(bid, ts(now, -3_600_000), now.toISOString());

      expect(status).toBe(200);
      expectTypeOf(json).toExtend<GetBuildingEfficiencyResponse | ErrorResponse>();
      if (!("metrics" in json)) {
        throw new Error("Expected response to contain 'metrics'");
      }
      expect(json.buildingId).toBe(bid);
      expect(json.buildingName).toBe("Test Building");
      expect(json.period).toBeDefined();
      expect(json.period.startDate).toBeDefined();
      expect(json.period.endDate).toBeDefined();
      expect(json.metrics).toBeDefined();
      expect(typeof json.metrics.totalEnergyConsumed).toBe("number");
      // All nullable metrics must be present as keys (even if null)
      expect("averageExternalTemperature"   in json.metrics).toBe(true);
      expect("estimatedHeatLossCoefficient" in json.metrics).toBe(true);
      expect("insulationQuality"            in json.metrics).toBe(true);
      expect("averageCop"                   in json.metrics).toBe(true);
    });

    test("period dates in response reflect the requested window", async () => {
      const building = await createBuilding();
      const bid = building._id.toString();
      const startDate = "2025-01-01T00:00:00.000Z";
      const endDate   = "2025-01-07T23:59:59.000Z";

      const { status, json } = await getEfficiency(bid, startDate, endDate);

      expect(status).toBe(200);
      if (!("period" in json)) {
        throw new Error("Expected response to contain 'period'");
      }
      expect(new Date(json.period.startDate).toISOString()).toBe(startDate);
      expect(new Date(json.period.endDate).toISOString()).toBe(endDate);
    });
  });
});
