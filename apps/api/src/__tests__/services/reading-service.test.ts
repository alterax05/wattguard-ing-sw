import { describe, test, expect, beforeAll, afterAll, beforeEach, spyOn } from "bun:test";
import { Types } from "mongoose";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { Sensor, type SensorStatus } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";
import { Alert } from "../../models/Alert";
import { Building } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";
import { User } from "../../models/User";
import { ingestReading, SensorNotFoundError } from "../../services/reading-service";

describe("Reading Service", () => {
  let userId: Types.ObjectId;
  let buildingId: Types.ObjectId;

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

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
      buildingId,
      sensorType: "internal_temp",
      location: "Sala Principale",
      installationDate: new Date("2024-01-01"),
      createdBy: userId,
      updatedBy: userId,
      ...options,
    });
  }

  test("should persist the reading and update lastReading", async () => {
    const sensor = await createSensor({ maxThreshold: 30 });
    const timestamp = new Date("2024-05-01T10:00:00Z");

    await ingestReading({
      sensorId: sensor._id.toString(),
      value: 22.5,
      unit: "°C",
      timestamp,
    });

    const reading = await SensorReading.findOne({ "metadata.sensorId": sensor._id });
    expect(reading).not.toBeNull();
    expect(reading!.value).toBe(22.5);
    expect(reading!.unit).toBe("°C");
    expect(reading!.timestamp).toEqual(timestamp);
    expect(reading!.metadata.sensorId.toString()).toBe(sensor._id.toString());
    expect(reading!.metadata.buildingId.toString()).toBe(buildingId.toString());
    expect(reading!.metadata.sensorType).toBe("internal_temp");

    const updated = await Sensor.findById(sensor._id);
    expect(updated!.lastReading).toBeDefined();
    expect(updated!.lastReading!.value).toBe(22.5);
    expect(updated!.lastReading!.timestamp).toEqual(timestamp);
    expect(updated!.lastReading!.unit).toBe("°C");
  });

  test("should reactivate an inactive sensor on new reading", async () => {
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

  test("should not create alerts for readings within thresholds", async () => {
    const sensor = await createSensor({ minThreshold: 10, maxThreshold: 30 });

    await ingestReading({
      sensorId: sensor._id.toString(),
      value: 22,
      unit: "°C",
      timestamp: new Date(),
    });

    expect(await Alert.countDocuments({ sensorId: sensor._id })).toBe(0);
  });

  test("should create a single active max-threshold alert", async () => {
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

    const alerts = await Alert.find({ sensorId: sensor._id });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.thresholdType).toBe("max");
    expect(alerts[0]!.severity).toBe("high");
    expect(alerts[0]!.status).toBe("active");
    expect(alerts[0]!.buildingName).toBe("Test Building");
    expect(alerts[0]!.sensorType).toBe("internal_temp");
    expect(alerts[0]!.location).toBe("Sala Principale");
    expect(alerts[0]!.value).toBe(35);
    expect(alerts[0]!.unit).toBe("°C");
    expect(alerts[0]!.limit).toBe(30);
    expect(alerts[0]!.toObject()).not.toHaveProperty("message");
  });

  test("should create a min-threshold alert", async () => {
    const sensor = await createSensor({ minThreshold: 10 });

    await ingestReading({
      sensorId: sensor._id.toString(),
      value: 5,
      unit: "°C",
      timestamp: new Date(),
    });

    const alert = await Alert.findOne({ sensorId: sensor._id });
    expect(alert).not.toBeNull();
    expect(alert!.thresholdType).toBe("min");
  });

  test("should throw SensorNotFoundError for unknown sensors", async () => {
    await expect(
      ingestReading({
        sensorId: new Types.ObjectId().toString(),
        value: 22,
        unit: "°C",
        timestamp: new Date(),
      }),
    ).rejects.toBeInstanceOf(SensorNotFoundError);
  });

  test("should not persist anything when the reading insert fails", async () => {
    const sensor = await createSensor({ minThreshold: 10, status: "inactive" });
    const readingCreateSpy = spyOn(SensorReading, "create").mockRejectedValueOnce(
      new Error("db down"),
    );

    await expect(
      ingestReading({
        sensorId: sensor._id.toString(),
        value: 5,
        unit: "°C",
        timestamp: new Date(),
      }),
    ).rejects.toThrow("db down");

    readingCreateSpy.mockRestore();

    expect(await Alert.countDocuments({ sensorId: sensor._id })).toBe(0);
    expect(await SensorReading.countDocuments({ "metadata.sensorId": sensor._id })).toBe(0);

    const updated = await Sensor.findById(sensor._id);
    expect(updated!.lastReading).toBeUndefined();
    expect(updated!.status).toBe("inactive");
  });

  test("should roll back the alert when the transaction fails", async () => {
    const sensor = await createSensor({ maxThreshold: 30 });
    const alertCreateSpy = spyOn(Alert, "create").mockRejectedValueOnce(
      new Error("db down"),
    );

    await expect(
      ingestReading({
        sensorId: sensor._id.toString(),
        value: 35,
        unit: "°C",
        timestamp: new Date(),
      }),
    ).rejects.toThrow("db down");

    alertCreateSpy.mockRestore();

    // The reading is already stored (time-series inserts cannot run inside
    // transactions); the alert and lastReading update must be rolled back.
    expect(await Alert.countDocuments({ sensorId: sensor._id })).toBe(0);
    expect(await SensorReading.countDocuments({ "metadata.sensorId": sensor._id })).toBe(1);

    const updated = await Sensor.findById(sensor._id);
    expect(updated!.lastReading).toBeUndefined();
    expect(updated!.status).toBe("active");
  });
});
