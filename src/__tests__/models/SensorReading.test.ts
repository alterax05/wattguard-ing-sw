import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { SensorReading } from "../../models/SensorReading";
import { Sensor } from "../../models/Sensor";
import { Building } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";
import { User } from "../../models/User";
import { Types } from "mongoose";

describe("SensorReading Model", () => {
  let userId: Types.ObjectId;
  let buildingId: Types.ObjectId;
  let sensorId: Types.ObjectId;

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
      buildingType: buildingType._id,
      heatingSystemType: "caldaia_gas",
      geographicZone: "Centro",
      createdBy: userId,
      updatedBy: userId,
    });
    buildingId = building._id;

    // Create sensor
    const sensor = await Sensor.create({
      buildingId: buildingId,
      sensorType: "internal_temp",
      location: "Sala Principale",
      serialNumber: "SN001",
      installationDate: new Date("2024-01-01"),
      transmissionInterval: 300,
      createdBy: userId,
      updatedBy: userId,
    });
    sensorId = sensor._id;
  });

  describe("Schema Validation", () => {
    test("should create a sensor reading with all required fields", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      expect(reading.timestamp).toBeInstanceOf(Date);
      expect(reading.value).toBe(22.5);
      expect(reading.unit).toBe("°C");
      expect(reading.metadata.sensorId.toString()).toBe(sensorId.toString());
      expect(reading.metadata.buildingId.toString()).toBe(buildingId.toString());
      expect(reading.metadata.sensorType).toBe("internal_temp");
      expect(reading._id).toBeDefined();
    });

    test("should fail without required timestamp", async () => {
      try {
        await SensorReading.create({
          value: 22.5,
          unit: "°C",
          metadata: {
            sensorId: sensorId,
            buildingId: buildingId,
            sensorType: "internal_temp",
          },
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors.timestamp).toBeDefined();
      }
    });

    test("should fail without required value", async () => {
      try {
        await SensorReading.create({
          timestamp: new Date(),
          unit: "°C",
          metadata: {
            sensorId: sensorId,
            buildingId: buildingId,
            sensorType: "internal_temp",
          },
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors.value).toBeDefined();
      }
    });

    test("should fail without required unit", async () => {
      try {
        await SensorReading.create({
          timestamp: new Date(),
          value: 22.5,
          metadata: {
            sensorId: sensorId,
            buildingId: buildingId,
            sensorType: "internal_temp",
          },
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors.unit).toBeDefined();
      }
    });

    test("should fail without required metadata.sensorId", async () => {
      try {
        await SensorReading.create({
          timestamp: new Date(),
          value: 22.5,
          unit: "°C",
          metadata: {
            buildingId: buildingId,
            sensorType: "internal_temp",
          } as any,
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors["metadata.sensorId"]).toBeDefined();
      }
    });

    test("should fail without required metadata.buildingId", async () => {
      try {
        await SensorReading.create({
          timestamp: new Date(),
          value: 22.5,
          unit: "°C",
          metadata: {
            sensorId: sensorId,
            sensorType: "internal_temp",
          } as any,
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors["metadata.buildingId"]).toBeDefined();
      }
    });

    test("should fail without required metadata.sensorType", async () => {
      try {
        await SensorReading.create({
          timestamp: new Date(),
          value: 22.5,
          unit: "°C",
          metadata: {
            sensorId: sensorId,
            buildingId: buildingId,
          } as any,
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors["metadata.sensorType"]).toBeDefined();
      }
    });

    test("should trim whitespace from unit", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "  °C  ",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      expect(reading.unit).toBe("°C");
    });
  });

  describe("Data Types", () => {
    test("should accept integer values", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 100,
        unit: "W",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "energy_meter",
        },
      });

      expect(reading.value).toBe(100);
    });

    test("should accept decimal values", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 22.567,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      expect(reading.value).toBe(22.567);
    });

    test("should accept negative values", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: -5.2,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "external_temp",
        },
      });

      expect(reading.value).toBe(-5.2);
    });

    test("should accept zero value", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 0,
        unit: "W",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "energy_meter",
        },
      });

      expect(reading.value).toBe(0);
    });
  });

  describe("Time-Series Queries", () => {
    beforeEach(async () => {
      // Create multiple readings at different times
      const now = new Date();
      
      await SensorReading.create({
        timestamp: new Date(now.getTime() - 3600000), // 1 hour ago
        value: 21.0,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.create({
        timestamp: new Date(now.getTime() - 1800000), // 30 min ago
        value: 22.0,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.create({
        timestamp: now,
        value: 23.0,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });
    });

    test("should query readings by time range", async () => {
      const now = new Date();
      const startTime = new Date(now.getTime() - 2000000); // 33 min ago
      const endTime = new Date(now.getTime() + 100000); // future

      const readings = await SensorReading.find({
        timestamp: {
          $gte: startTime,
          $lte: endTime,
        },
      });

      expect(readings.length).toBe(2); // Last two readings
    });

    test("should query readings by sensorId", async () => {
      const readings = await SensorReading.find({
        "metadata.sensorId": sensorId,
      });

      expect(readings.length).toBe(3);
      expect(readings.every((r) => r.metadata.sensorId.toString() === sensorId.toString())).toBe(
        true
      );
    });

    test("should query readings by buildingId", async () => {
      const readings = await SensorReading.find({
        "metadata.buildingId": buildingId,
      });

      expect(readings.length).toBe(3);
      expect(
        readings.every((r) => r.metadata.buildingId.toString() === buildingId.toString())
      ).toBe(true);
    });

    test("should query readings by sensorType", async () => {
      const readings = await SensorReading.find({
        "metadata.sensorType": "internal_temp",
      });

      expect(readings.length).toBe(3);
      expect(readings.every((r) => r.metadata.sensorType === "internal_temp")).toBe(true);
    });

    test("should sort readings by timestamp", async () => {
      const readings = await SensorReading.find({
        "metadata.sensorId": sensorId,
      }).sort({ timestamp: -1 });

      expect(readings.length).toBe(3);
      // Check descending order
      for (let i = 0; i < readings.length - 1; i++) {
        expect(readings[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
          readings[i + 1]!.timestamp.getTime()
        );
      }
    });

    test("should get latest reading for sensor", async () => {
      const latestReading = await SensorReading.findOne({
        "metadata.sensorId": sensorId,
      }).sort({ timestamp: -1 });

      expect(latestReading).not.toBeNull();
      expect(latestReading!.value).toBe(23.0);
    });

    test("should calculate average value over time range", async () => {
      const readings = await SensorReading.find({
        "metadata.sensorId": sensorId,
      });

      const values = readings.map((r) => r.value);
      const average = values.reduce((sum, val) => sum + val, 0) / values.length;

      expect(average).toBe(22.0); // (21 + 22 + 23) / 3
    });
  });

  describe("Multiple Sensors", () => {
    let sensor2Id: Types.ObjectId;

    beforeEach(async () => {
      const sensor2 = await Sensor.create({
        buildingId: buildingId,
        sensorType: "external_temp",
        location: "Esterno",
        serialNumber: "SN002",
        installationDate: new Date("2024-01-01"),
        transmissionInterval: 300,
        createdBy: userId,
        updatedBy: userId,
      });
      sensor2Id = sensor2._id;

      // Create readings for both sensors
      await SensorReading.create({
        timestamp: new Date(),
        value: 22.0,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.create({
        timestamp: new Date(),
        value: 10.0,
        unit: "°C",
        metadata: {
          sensorId: sensor2Id,
          buildingId: buildingId,
          sensorType: "external_temp",
        },
      });
    });

    test("should filter readings by specific sensor", async () => {
      const sensor1Readings = await SensorReading.find({
        "metadata.sensorId": sensorId,
      });

      expect(sensor1Readings.length).toBe(1);
      expect(sensor1Readings[0]!.value).toBe(22.0);
    });

    test("should get all readings for a building", async () => {
      const buildingReadings = await SensorReading.find({
        "metadata.buildingId": buildingId,
      });

      expect(buildingReadings.length).toBe(2);
    });

    test("should filter by sensor type", async () => {
      const internalReadings = await SensorReading.find({
        "metadata.sensorType": "internal_temp",
      });

      const externalReadings = await SensorReading.find({
        "metadata.sensorType": "external_temp",
      });

      expect(internalReadings.length).toBe(1);
      expect(externalReadings.length).toBe(1);
      expect(internalReadings[0]!.value).toBe(22.0);
      expect(externalReadings[0]!.value).toBe(10.0);
    });
  });

  describe("CRUD Operations", () => {
    test("should create sensor reading", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      expect(reading._id).toBeDefined();
    });

    test("should find sensor reading by id", async () => {
      const created = await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      const found = await SensorReading.findById(created._id);

      expect(found).not.toBeNull();
      expect(found!.value).toBe(22.5);
    });

    test("should delete sensor reading", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.deleteOne({ _id: reading._id });

      const found = await SensorReading.findById(reading._id);

      expect(found).toBeNull();
    });

    test("should delete multiple readings", async () => {
      await SensorReading.create({
        timestamp: new Date(),
        value: 21.0,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.create({
        timestamp: new Date(),
        value: 22.0,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.deleteMany({ "metadata.sensorId": sensorId });

      const remaining = await SensorReading.find({ "metadata.sensorId": sensorId });

      expect(remaining.length).toBe(0);
    });

    test("should count sensor readings", async () => {
      await SensorReading.create({
        timestamp: new Date(),
        value: 21.0,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.create({
        timestamp: new Date(),
        value: 22.0,
        unit: "°C",
        metadata: {
          sensorId: sensorId,
          buildingId: buildingId,
          sensorType: "internal_temp",
        },
      });

      const count = await SensorReading.countDocuments({ "metadata.sensorId": sensorId });

      expect(count).toBe(2);
    });
  });
});
