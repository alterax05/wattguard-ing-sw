import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
} from "bun:test";
import mongoose, { Types } from "mongoose";
import { setupIntegrationTests } from "../helpers/db";
import { Alert } from "../../models/Alert";
import { ensureI18nReady } from "../../lib/i18n";
import {
  THRESHOLD_ALERT_TYPE,
  EFFICIENCY_ALERT_TYPE,
} from "@wattguard/shared";
import {
  raiseThreshold,
  raiseEfficiency,
  acknowledge,
  resolveManually,
  resolveEfficiencyForBuilding,
  pruneForRemovedThresholds,
  deleteForBuilding,
  deleteForSensor,
  toAlertDTO,
  SYSTEM_RESOLVER,
} from "../../lib/alerts";

setupIntegrationTests();

beforeAll(async () => {
  await ensureI18nReady();
});

describe("lib/alerts", () => {
  let buildingId: Types.ObjectId;
  let sensorId: Types.ObjectId;

  beforeEach(() => {
    buildingId = new Types.ObjectId();
    sensorId = new Types.ObjectId();
  });

  test("raiseThreshold creates a threshold alert inside a transaction and dedupes", async () => {
    let result: { ok: true; created: boolean } | { ok: false; code: string };

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        result = await raiseThreshold({
          sensor: sensorId,
          building: buildingId,
          value: 35,
          unit: "°C",
          thresholdType: "max",
          limit: 30,
          session,
        });
      });
    } finally {
      await session.endSession();
    }

    expect(result!).toEqual({ ok: true, created: true });

    const alert = await Alert.findOne({ sensor: sensorId });
    expect(alert).not.toBeNull();
    expect(alert!.type).toBe(THRESHOLD_ALERT_TYPE);
    expect(alert!.thresholdType).toBe("max");
    // 35 over a limit of 30 = 16.7% deviation -> medium band
    expect(alert!.severity).toBe("medium");
    expect(alert!.limit).toBe(30);
    expect(alert!.status).toBe("active");
    expect(alert!.building.toString()).toBe(buildingId.toString());

    let second: { ok: true; created: boolean } | { ok: false; code: string };
    const session2 = await mongoose.startSession();
    try {
      await session2.withTransaction(async () => {
        second = await raiseThreshold({
          sensor: sensorId,
          building: buildingId,
          value: 36,
          unit: "°C",
          thresholdType: "max",
          limit: 30,
          session: session2,
        });
      });
    } finally {
      await session2.endSession();
    }

    expect(second!).toEqual({ ok: true, created: false });
    expect(await Alert.countDocuments({ sensor: sensorId })).toBe(1);
  });

  test("raiseThreshold defaults severity to high and limit to null", async () => {
    let result: { ok: true; created: boolean } | { ok: false; code: string };
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        result = await raiseThreshold({
          sensor: sensorId,
          building: buildingId,
          value: 12,
          unit: "°C",
          thresholdType: "min",
          limit: null,
          session,
        });
      });
    } finally {
      await session.endSession();
    }

    expect(result!).toEqual({ ok: true, created: true });

    const alert = await Alert.findOne({ sensor: sensorId });
    expect(alert!.severity).toBe("high");
    expect(alert!.limit).toBeNull();
  });

  test("raiseEfficiency creates an efficiency alert with rounded value and dedupes", async () => {
    const res = await raiseEfficiency({
      building: buildingId,
      cop: 2.567,
      minCop: 2.5,
    });
    expect(res).toEqual({ ok: true, created: true });

    const alert = await Alert.findOne({ building: buildingId, type: EFFICIENCY_ALERT_TYPE });
    expect(alert).not.toBeNull();
    expect(alert!.value).toBe(2.57);
    expect(alert!.unit).toBe("COP");
    expect(alert!.thresholdType).toBe("min");
    // 2.567 against a 2.5 limit = 2.7% deviation -> low band
    expect(alert!.severity).toBe("low");
    expect(alert!.limit).toBe(2.5);
    expect(alert!.status).toBe("active");
    expect(alert!.sensor).toBeUndefined();

    const second = await raiseEfficiency({
      building: buildingId,
      cop: 2.1,
      minCop: 2.5,
    });
    expect(second).toEqual({ ok: true, created: false });
    expect(await Alert.countDocuments({ building: buildingId, type: EFFICIENCY_ALERT_TYPE })).toBe(1);
  });

  test("acknowledge stamps actor and now, then rejects repeat, missing and invalid ids", async () => {
    const alert = await Alert.create({
      building: buildingId,
      type: THRESHOLD_ALERT_TYPE,
      severity: "high",
      status: "active",
    });

    const now = new Date("2024-06-01T12:00:00Z");
    const res = await acknowledge({ id: alert._id.toString(), actor: "Mario Rossi", now });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.alert.status).toBe("acknowledged");
      expect(res.alert.acknowledgedBy).toBe("Mario Rossi");
      expect(res.alert.acknowledgedAt).toEqual(now);
    }

    const again = await acknowledge({ id: alert._id.toString(), actor: "Mario Rossi" });
    expect(again).toEqual({ ok: false, code: "alert_not_active" });

    const missing = await acknowledge({
      id: new Types.ObjectId().toString(),
      actor: "Mario Rossi",
    });
    expect(missing).toEqual({ ok: false, code: "alert_not_found" });

    const invalid = await acknowledge({ id: "not-an-id", actor: "Mario Rossi" });
    expect(invalid).toEqual({ ok: false, code: "invalid_alert_id" });
  });

  test("resolveManually resolves active and acknowledged alerts", async () => {
    const active = await Alert.create({
      building: buildingId,
      type: THRESHOLD_ALERT_TYPE,
      severity: "high",
      status: "active",
    });
    const acknowledged = await Alert.create({
      building: buildingId,
      type: THRESHOLD_ALERT_TYPE,
      severity: "high",
      status: "acknowledged",
    });

    const fromActive = await resolveManually({ id: active._id.toString(), actor: "Mario Rossi" });
    expect(fromActive.ok).toBe(true);
    if (fromActive.ok) {
      expect(fromActive.alert.status).toBe("resolved");
      expect(fromActive.alert.resolvedBy).toBe("Mario Rossi");
    }

    const fromAcknowledged = await resolveManually({
      id: acknowledged._id.toString(),
      actor: "Mario Rossi",
    });
    expect(fromAcknowledged.ok).toBe(true);
  });

  test("resolveManually rejects already-resolved and missing alerts", async () => {
    const resolved = await Alert.create({
      building: buildingId,
      type: THRESHOLD_ALERT_TYPE,
      severity: "high",
      status: "resolved",
      resolvedBy: "Mario Rossi",
      resolvedAt: new Date(),
    });

    const fromResolved = await resolveManually({
      id: resolved._id.toString(),
      actor: "Mario Rossi",
    });
    expect(fromResolved).toEqual({ ok: false, code: "alert_already_resolved" });

    const missing = await resolveManually({
      id: new Types.ObjectId().toString(),
      actor: "Mario Rossi",
    });
    expect(missing).toEqual({ ok: false, code: "alert_not_found" });
  });

  test("resolveEfficiencyForBuilding resolves only active and acknowledged efficiency alerts", async () => {
    await Alert.create({
      building: buildingId,
      type: EFFICIENCY_ALERT_TYPE,
      severity: "high",
      status: "active",
    });
    await Alert.create({
      building: buildingId,
      type: EFFICIENCY_ALERT_TYPE,
      severity: "high",
      status: "acknowledged",
    });
    await Alert.create({
      building: buildingId,
      type: EFFICIENCY_ALERT_TYPE,
      severity: "high",
      status: "resolved",
      resolvedBy: "previous-actor",
      resolvedAt: new Date("2024-05-01T12:00:00Z"),
    });
    await Alert.create({
      building: buildingId,
      type: THRESHOLD_ALERT_TYPE,
      severity: "high",
      status: "active",
    });

    const res = await resolveEfficiencyForBuilding({
      building: buildingId,
      actor: SYSTEM_RESOLVER,
      now: new Date("2024-06-01T12:00:00Z"),
    });
    expect(res).toEqual({ ok: true, resolved: 2 });

    const efficiencyAlerts = await Alert.find({ building: buildingId, type: EFFICIENCY_ALERT_TYPE });
    expect(efficiencyAlerts).toHaveLength(3);
    const newlyResolved = efficiencyAlerts.filter((a) => a.resolvedBy === SYSTEM_RESOLVER);
    expect(newlyResolved).toHaveLength(2);
    for (const alert of newlyResolved) {
      expect(alert.status).toBe("resolved");
      expect(alert.resolvedAt).toEqual(new Date("2024-06-01T12:00:00Z"));
    }
    const alreadyResolved = efficiencyAlerts.find((a) => a.resolvedBy === "previous-actor");
    expect(alreadyResolved!.status).toBe("resolved");
    expect(alreadyResolved!.resolvedAt).toEqual(new Date("2024-05-01T12:00:00Z"));

    const threshold = await Alert.findOne({ building: buildingId, type: THRESHOLD_ALERT_TYPE });
    expect(threshold!.status).toBe("active");

    const zero = await resolveEfficiencyForBuilding({
      building: buildingId,
      actor: SYSTEM_RESOLVER,
    });
    expect(zero).toEqual({ ok: true, resolved: 0 });
  });

  test("pruneForRemovedThresholds deletes matching and legacy alerts, keeps others", async () => {
    const minAlert = await Alert.create({
      building: buildingId,
      sensor: sensorId,
      type: THRESHOLD_ALERT_TYPE,
      thresholdType: "min",
      severity: "high",
      status: "active",
    });
    const maxAlert = await Alert.create({
      building: buildingId,
      sensor: sensorId,
      type: THRESHOLD_ALERT_TYPE,
      thresholdType: "max",
      severity: "high",
      status: "active",
    });
    const legacyAlert = await Alert.create({
      building: buildingId,
      sensor: sensorId,
      type: THRESHOLD_ALERT_TYPE,
      severity: "high",
      status: "active",
    });
    const efficiencyAlert = await Alert.create({
      building: buildingId,
      type: EFFICIENCY_ALERT_TYPE,
      severity: "high",
      status: "active",
    });

    const res = await pruneForRemovedThresholds({ sensor: sensorId, removedThresholdTypes: ["min"] });
    expect(res).toEqual({ ok: true, deleted: 2 });

    expect(await Alert.findById(minAlert._id)).toBeNull();
    expect(await Alert.findById(legacyAlert._id)).toBeNull();
    expect((await Alert.findById(maxAlert._id))!.status).toBe("active");
    expect((await Alert.findById(efficiencyAlert._id))!.status).toBe("active");

    const empty = await pruneForRemovedThresholds({ sensor: sensorId, removedThresholdTypes: [] });
    expect(empty).toEqual({ ok: true, deleted: 0 });
    expect(await Alert.countDocuments({ sensor: sensorId })).toBe(1);
    expect(await Alert.countDocuments({})).toBe(2);
  });

  test("deleteForBuilding and deleteForSensor delete only matching docs", async () => {
    const otherSensorId = new Types.ObjectId();
    const otherBuildingId = new Types.ObjectId();

    await Alert.create({
      building: buildingId,
      sensor: sensorId,
      type: THRESHOLD_ALERT_TYPE,
      severity: "high",
      status: "active",
    });
    await Alert.create({
      building: buildingId,
      sensor: otherSensorId,
      type: THRESHOLD_ALERT_TYPE,
      severity: "high",
      status: "active",
    });
    await Alert.create({
      building: otherBuildingId,
      sensor: sensorId,
      type: THRESHOLD_ALERT_TYPE,
      severity: "high",
      status: "active",
    });

    const delSensor = await deleteForSensor(sensorId);
    expect(delSensor).toEqual({ ok: true, deleted: 2 });

    const delBuilding = await deleteForBuilding(buildingId);
    expect(delBuilding).toEqual({ ok: true, deleted: 1 });

    expect(await Alert.countDocuments({})).toBe(0);
  });

  test("toAlertDTO serializes the full alert shape", async () => {
    const alert = await Alert.create({
      building: buildingId,
      sensor: sensorId,
      type: THRESHOLD_ALERT_TYPE,
      thresholdType: "max",
      severity: "high",
      value: 35,
      unit: "°C",
      limit: 30,
      status: "acknowledged",
      acknowledgedBy: "Mario Rossi",
      acknowledgedAt: new Date("2024-06-01T12:00:00Z"),
    });

    const dto = toAlertDTO(alert);

    expect(dto.id).toBe(alert._id.toString());
    expect(dto.building).toBe(buildingId.toString());
    expect(dto.sensor).toBe(sensorId.toString());
    expect(dto.type).toBe(THRESHOLD_ALERT_TYPE);
    expect(dto.thresholdType).toBe("max");
    expect(dto.severity).toBe("high");
    expect(dto.value).toBe(35);
    expect(dto.unit).toBe("°C");
    expect(dto.limit).toBe(30);
    expect(dto.status).toBe("acknowledged");
    expect(dto.acknowledgedBy).toBe("Mario Rossi");
    expect(dto.acknowledgedAt).toBe("2024-06-01T12:00:00.000Z");
    expect(dto.resolvedBy).toBeUndefined();
    expect(dto.resolvedAt).toBeUndefined();
    expect(dto.createdAt).toBe(alert.createdAt.toISOString());
    expect(dto.updatedAt).toBe(alert.updatedAt.toISOString());
  });

  test("toAlertDTO localizes the system resolver and passes user names through", async () => {
    const systemAlert = await Alert.create({
      building: buildingId,
      type: THRESHOLD_ALERT_TYPE,
      severity: "high",
      status: "resolved",
      resolvedBy: SYSTEM_RESOLVER,
      resolvedAt: new Date("2024-06-01T12:00:00Z"),
    });

    expect(toAlertDTO(systemAlert, { locale: "en" }).resolvedBy).toBe("System");
    expect(toAlertDTO(systemAlert, { locale: "it" }).resolvedBy).toBe("Sistema");
    expect(toAlertDTO(systemAlert).resolvedBy).toBe(SYSTEM_RESOLVER);

    const userAlert = await Alert.create({
      building: buildingId,
      type: THRESHOLD_ALERT_TYPE,
      severity: "high",
      status: "resolved",
      resolvedBy: "Mario Rossi",
      resolvedAt: new Date("2024-06-01T12:00:00Z"),
    });

    expect(toAlertDTO(userAlert, { locale: "it" }).resolvedBy).toBe("Mario Rossi");
    expect(toAlertDTO(userAlert).resolvedBy).toBe("Mario Rossi");
  });
});