import {
  describe,
  test,
  expect,
  beforeEach,
  mock,
} from "bun:test";
import { Types } from "mongoose";
import { setupIntegrationTests } from "../helpers/db";
import { Sensor } from "../../models/Sensor";
import type { SensorStatus } from "@wattguard/shared";
import { SensorReading } from "../../models/SensorReading";
import { Alert } from "../../models/Alert";
import { Building } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";
import { User } from "../../models/User";
import { ingestReading, SensorNotFoundError } from "../../services/reading-service";

// Silence the fire-and-forget alert email dispatch triggered by ingestion.
await mock.module("../../email/mailer", () => ({
  sendInviteEmail: mock(async () => Promise.resolve()),
  sendPasswordResetEmail: mock(async () => Promise.resolve()),
  sendEmail: mock(async () => Promise.resolve()),
  sendTestEmail: mock(async () => Promise.resolve()),
  sendAlertEmail: mock(async () => Promise.resolve()),
}));

setupIntegrationTests();

describe("readingService", () => {
  let userId: Types.ObjectId;
  let buildingId: Types.ObjectId;

  beforeEach(async () => {

    // Create test user
    const user = await User.create({
      email: "test@example.com",
      role: "admin",
      passwordHash: await Bun.password.hash("test123", { algorithm: "bcrypt", cost: 10 }),
    });
    userId = user._id;

    // Create building type and building
    const buildingType = await BuildingType.create({
      name: "Residenziale",
    });

    const building = await Building.create({
      name: "Test Building",
      address: "Via Test 1",
      surface: 1000,
      location: { type: "Point", coordinates: [11.1167, 46.0667] },
      buildingType: buildingType._id,
      heatingSystemType: "caldaia_gas",
      geographicZone: "Centro",
      createdBy: userId,
      updatedBy: userId,
    });
    buildingId = building._id;
  });

  async function createSensor(
    options: { status?: SensorStatus; minThreshold?: number; maxThreshold?: number } = {},
  ) {
    return Sensor.create({
      building: buildingId,
      sensorType: "internal_temp",
      location: "Sala Principale",
      installationDate: new Date("2024-01-01"),
      createdBy: userId,
      updatedBy: userId,
      ...options,
    });
  }

  test("persists the reading and updates lastReading", async () => {
    const sensor = await createSensor({ maxThreshold: 30 });
    const timestamp = new Date("2024-05-01T10:00:00Z");

    await ingestReading({
      sensorId: sensor._id.toString(),
      value: 22.5,
      unit: "°C",
      timestamp,
    });

    const reading = await SensorReading.findOne({ "metadata.sensor": sensor._id });
    expect(reading).not.toBeNull();
    expect(reading!.value).toBe(22.5);
    expect(reading!.unit).toBe("°C");
    expect(reading!.timestamp).toEqual(timestamp);
    expect(reading!.metadata.sensor.toString()).toBe(sensor._id.toString());
    expect(reading!.metadata.building.toString()).toBe(buildingId.toString());
    expect(reading!.metadata.sensorType).toBe("internal_temp");

    const updated = await Sensor.findById(sensor._id);
    expect(updated!.lastReading).toBeDefined();
    expect(updated!.lastReading!.value).toBe(22.5);
    expect(updated!.lastReading!.timestamp).toEqual(timestamp);
    expect(updated!.lastReading!.unit).toBe("°C");
  });

  test("reactivates an inactive sensor on new reading", async () => {
    const sensor = await createSensor({ status: "inactive" });

    await ingestReading({
      sensorId: sensor._id.toString(),
      value: 22.5,
      unit: "°C",
      timestamp: new Date(),
    });

    const updated = await Sensor.findById(sensor._id);
    expect(updated!.status).toBe("active");
  });

  test("does not create alerts for readings within thresholds", async () => {
    const sensor = await createSensor({ minThreshold: 10, maxThreshold: 30 });

    await ingestReading({
      sensorId: sensor._id.toString(),
      value: 22,
      unit: "°C",
      timestamp: new Date(),
    });

    expect(await Alert.countDocuments({ sensor: sensor._id })).toBe(0);
  });

  test("creates a single active max-threshold alert", async () => {
    const sensor = await createSensor({ maxThreshold: 30 });

    await ingestReading({
      sensorId: sensor._id.toString(),
      value: 35,
      unit: "°C",
      timestamp: new Date(),
    });
    await ingestReading({
      sensorId: sensor._id.toString(),
      value: 36,
      unit: "°C",
      timestamp: new Date(),
    });

    const alerts = await Alert.find({ sensor: sensor._id });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.thresholdType).toBe("max");
    // 35 over a limit of 30 = 16.7% deviation -> medium band
    expect(alerts[0]!.severity).toBe("medium");
    expect(alerts[0]!.status).toBe("active");
    expect(alerts[0]!.building.toString()).toBe(buildingId.toString());
    expect(alerts[0]!.value).toBe(35);
    expect(alerts[0]!.unit).toBe("°C");
    expect(alerts[0]!.limit).toBe(30);
    expect(alerts[0]!.toObject()).not.toHaveProperty("message");
  });

  test("creates a min-threshold alert", async () => {
    const sensor = await createSensor({ minThreshold: 10 });

    await ingestReading({
      sensorId: sensor._id.toString(),
      value: 5,
      unit: "°C",
      timestamp: new Date(),
    });

    const alert = await Alert.findOne({ sensor: sensor._id });
    expect(alert).not.toBeNull();
    expect(alert!.thresholdType).toBe("min");
  });

  test("throws SensorNotFoundError for unknown sensors", async () => {
    let caught: unknown;
    try {
      await ingestReading({
        sensorId: new Types.ObjectId().toString(),
        value: 22,
        unit: "°C",
        timestamp: new Date(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SensorNotFoundError);
  });
});
