/**
 * Integration tests for the periodic efficiency evaluator service
 * (evaluateEfficiencyAlerts).
 *
 * The service scans active buildings with efficiency thresholds enabled,
 * computes the average COP over a fixed rolling 24h window and:
 *   - emits a deduped active alert when COP < minCop
 *   - resolves active/acknowledged alerts when COP recovers (>= minCop)
 *   - stays silent when thresholds are disabled, data is insufficient
 *     (averageCop null) or the building is district heating
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  mock,
} from "bun:test";

import mongoose from "mongoose";

// ── Weather mock — must be declared BEFORE the service import so the
//    transitively imported lib/efficiency receives the mocked module when
//    it is first evaluated.
let mockWeatherImpl: () => Promise<number | null> = () => Promise.resolve(5.0);

await mock.module("../../lib/weather", () => ({
  getAverageHistoricalTemperature: mock(() => mockWeatherImpl()),
  getCoordinates: mock(() => Promise.resolve(null)),
}));

// ── Mailer mock — the evaluator fires alert notification emails when alerts
//    are created or auto-resolved; keep tests hermetic.
await mock.module("../../email/mailer", () => ({
  sendInviteEmail: mock(async () => Promise.resolve()),
  sendPasswordResetEmail: mock(async () => Promise.resolve()),
  sendEmail: mock(async () => Promise.resolve()),
  sendTestEmail: mock(async () => Promise.resolve()),
  sendAlertEmail: mock(async () => Promise.resolve()),
}));

// ── Imports (after the module mock is registered) ─────────────────────────────
import { setupIntegrationTests } from "../helpers/db";
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";
import { Alert } from "../../models/Alert";
import { EFFICIENCY_ALERT_TYPE, computeDeviationSeverity } from "../../lib/alerts";
import { evaluateEfficiencyAlerts } from "../../services/efficiency-alert-service";

// ── silence console noise during tests ──────────────────────────────────────

// ── shared state ─────────────────────────────────────────────────────────────
let adminUserId: mongoose.Types.ObjectId;
let buildingTypeId: mongoose.Types.ObjectId;

// ── helpers ──────────────────────────────────────────────────────────────────

/** Short alias to make SensorReading payloads terse. */
function mkReading(
  timestamp: Date,
  value: number,
  unit: string,
  sensorType: string,
  sensorId: string,
  buildingId: string,
) {
  return { timestamp, value, unit, metadata: { sensor: sensorId, building: buildingId, sensorType } };
}

// ── lifecycle ────────────────────────────────────────────────────────────────

setupIntegrationTests();

beforeEach(async () => {

  // Reset weather mock to a sensible default before each test
  mockWeatherImpl = () => Promise.resolve(5.0);

  // Create admin user (no login needed — the service is called directly)
  const hash = await Bun.password.hash("admin123", { algorithm: "bcrypt", cost: 10 });
  const admin = await User.create({ email: "admin@test.com", role: "admin", passwordHash: hash });
  adminUserId = admin._id;

  // Create a building type
  const bt = await BuildingType.create({ name: "TestType", description: "For testing" });
  buildingTypeId = bt._id;
});

// ── factory: create a minimal active building ─────────────────────────────────
async function createBuilding(overrides: Partial<{
  heatingSystemType: string;
  surface: number;
  ceilingHeight: number;
  efficiencyThresholds: { enabled: boolean; minCop: number | null };
}> = {}) {
  const base = {
    name: "Test Building",
    address: "Via Test 1, Milano",
    geographicZone: "Centro",
    buildingType: buildingTypeId,
    surface: overrides.surface ?? 500,
    ceilingHeight: overrides.ceilingHeight ?? 3.0,
    constructionYear: 2000,
    heatingSystemType: overrides.heatingSystemType ?? "pompa_calore",
    location: { type: "Point" as const, coordinates: [11.1167, 46.0667] },
    status: "active" as const,
    createdBy: adminUserId,
    updatedBy: adminUserId,
  };
  if (overrides.efficiencyThresholds !== undefined) {
    return Building.create({
      ...base,
      efficiencyThresholds: overrides.efficiencyThresholds,
    });
  }
  return Building.create(base);
}

/** Create a sensor attached to `buildingId`. */
async function createSensor(
  buildingId: string,
  sensorType: "internal_temp" | "external_temp" | "energy_meter" | "gas_meter",
) {
  return Sensor.create({
    building: buildingId,
    sensorType,
    location: "Test Location",
    installationDate: new Date(),
    status: "active",
    transmissionInterval: 90,
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
}

/**
 * Seed a heat-pump physics scenario: 5 cooling buckets (heater off, temp
 * falls) then 4 heating buckets (heater on at 2 kW, temp rises). Produces a
 * non-null averageCop (typically 1–3). External temp is always seeded so the
 * weather API is never called.
 *
 * CRITICAL: `t0` must be relative to `new Date()` — the evaluator computes
 * over a rolling window [now − 24h, now].
 */
async function seedHeatPumpReadings(
  bid: string,
  sid_i: string,
  sid_e: string,
  sid_p: string,
  t0: Date,
) {
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
}

// ═════════════════════════════════════════════════════════════════════════════
//  TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("evaluateEfficiencyAlerts", () => {
  test("creates an active efficiency alert when COP drops below threshold", async () => {
    const building = await createBuilding({
      efficiencyThresholds: { enabled: true, minCop: 10 }, // 10 is above any realistic COP
    });
    const bid = building._id.toString();

    const iSensor = await createSensor(bid, "internal_temp");
    const eSensor = await createSensor(bid, "external_temp");
    const pSensor = await createSensor(bid, "energy_meter");

    const now = new Date();
    const t0 = new Date(now.getTime() - 10 * 60_000);
    await seedHeatPumpReadings(
      bid,
      iSensor._id.toString(),
      eSensor._id.toString(),
      pSensor._id.toString(),
      t0,
    );

    await evaluateEfficiencyAlerts();

    const alerts = await Alert.find({ building: building._id, type: EFFICIENCY_ALERT_TYPE });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.building.toString()).toBe(bid);
    expect(alerts[0]!.status).toBe("active");
    expect(alerts[0]!.thresholdType).toBe("min");
    // Severity is now derived from the deviation between value and limit
    // instead of being hardcoded.
    expect(alerts[0]!.severity).toBe(
      computeDeviationSeverity(alerts[0]!.value!, alerts[0]!.limit),
    );
    expect(alerts[0]!.value).toBeGreaterThan(0);
    expect(alerts[0]!.value).toBeLessThan(10);
    expect(alerts[0]!.limit).toBe(10);
    expect(alerts[0]!.unit).toBe("COP");
    expect(alerts[0]!.sensor).toBeUndefined();
  });

  test("dedupes: second evaluation does not create a second active alert", async () => {
    const building = await createBuilding({
      efficiencyThresholds: { enabled: true, minCop: 10 },
    });
    const bid = building._id.toString();

    const iSensor = await createSensor(bid, "internal_temp");
    const eSensor = await createSensor(bid, "external_temp");
    const pSensor = await createSensor(bid, "energy_meter");

    const now = new Date();
    const t0 = new Date(now.getTime() - 10 * 60_000);
    await seedHeatPumpReadings(
      bid,
      iSensor._id.toString(),
      eSensor._id.toString(),
      pSensor._id.toString(),
      t0,
    );

    await evaluateEfficiencyAlerts();
    await evaluateEfficiencyAlerts();

    const count = await Alert.countDocuments({
      building: building._id,
      type: EFFICIENCY_ALERT_TYPE,
      status: "active",
    });
    expect(count).toBe(1);
  });

  test("resolves the alert when COP recovers above threshold", async () => {
    const building = await createBuilding({
      efficiencyThresholds: { enabled: true, minCop: 10 },
    });
    const bid = building._id.toString();

    const iSensor = await createSensor(bid, "internal_temp");
    const eSensor = await createSensor(bid, "external_temp");
    const pSensor = await createSensor(bid, "energy_meter");

    const now = new Date();
    const t0 = new Date(now.getTime() - 10 * 60_000);
    await seedHeatPumpReadings(
      bid,
      iSensor._id.toString(),
      eSensor._id.toString(),
      pSensor._id.toString(),
      t0,
    );

    await evaluateEfficiencyAlerts();
    const active = await Alert.findOne({
      building: building._id,
      type: EFFICIENCY_ALERT_TYPE,
      status: "active",
    });
    expect(active).not.toBeNull();

    // 0.1 is below any realistic COP → the building has recovered
    await Building.findByIdAndUpdate(building._id, {
      $set: { "efficiencyThresholds.minCop": 0.1 },
    });

    await evaluateEfficiencyAlerts();

    const alert = await Alert.findOne({ building: building._id, type: EFFICIENCY_ALERT_TYPE });
    expect(alert!.status).toBe("resolved");
    expect(alert!.resolvedBy).toBe("system");
    expect(alert!.resolvedAt).toBeDefined();
  });


});
