import { describe, test, expect, beforeEach } from "bun:test";
import { setupIntegrationTests } from "../helpers/db";
import { SensorReading } from "../../models/SensorReading";
import { Sensor } from "../../models/Sensor";
import { Building } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";
import { User } from "../../models/User";
import { Types, Error as MongooseError } from "mongoose";

setupIntegrationTests();

describe("SensorReading schema", () => {
  let userId: Types.ObjectId;
  let buildingId: Types.ObjectId;
  let sensorId: Types.ObjectId;

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

    // Create sensor
    const sensor = await Sensor.create({
      building: buildingId,
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

  describe("schema validation", () => {
    test("creates a sensor reading with all required fields", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      expect(reading.timestamp).toBeInstanceOf(Date);
      expect(reading.value).toBe(22.5);
      expect(reading.unit).toBe("°C");
      expect(reading.metadata.sensor.toString()).toBe(sensorId.toString());
      expect(reading.metadata.building.toString()).toBe(buildingId.toString());
      expect(reading.metadata.sensorType).toBe("internal_temp");
      expect(reading._id).toBeDefined();
    });

    test("fails without required timestamp", async () => {
      await expect(
        SensorReading.create({
          value: 22.5,
          unit: "°C",
          metadata: {
            sensor: sensorId,
            building: buildingId,
            sensorType: "internal_temp",
          },
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });

    test("fails without required value", async () => {
      await expect(
        SensorReading.create({
          timestamp: new Date(),
          unit: "°C",
          metadata: {
            sensor: sensorId,
            building: buildingId,
            sensorType: "internal_temp",
          },
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });

    test("fails without required unit", async () => {
      await expect(
        SensorReading.create({
          timestamp: new Date(),
          value: 22.5,
          metadata: {
            sensor: sensorId,
            building: buildingId,
            sensorType: "internal_temp",
          },
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });

    test("fails without required metadata.sensor", async () => {
      await expect(
        SensorReading.create({
          timestamp: new Date(),
          value: 22.5,
          unit: "°C",
          metadata: {
            building: buildingId,
            sensorType: "internal_temp",
          },
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });

    test("fails without required metadata.building", async () => {
      await expect(
        SensorReading.create({
          timestamp: new Date(),
          value: 22.5,
          unit: "°C",
          metadata: {
            sensor: sensorId,
            sensorType: "internal_temp",
          },
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });

    test("fails without required metadata.sensorType", async () => {
      await expect(
        SensorReading.create({
          timestamp: new Date(),
          value: 22.5,
          unit: "°C",
          metadata: {
            sensor: sensorId,
            building: buildingId,
          },
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });

    test("trims whitespace from unit", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "  °C  ",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      expect(reading.unit).toBe("°C");
    });
  });

  describe("data types", () => {
    test("accepts integer values", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 100,
        unit: "W",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "energy_meter",
        },
      });

      expect(reading.value).toBe(100);
    });

    test("accepts decimal values", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 22.567,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      expect(reading.value).toBe(22.567);
    });

    test("accepts negative values", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: -5.2,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "external_temp",
        },
      });

      expect(reading.value).toBe(-5.2);
    });

    test("accepts zero value", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 0,
        unit: "W",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "energy_meter",
        },
      });

      expect(reading.value).toBe(0);
    });
  });

  describe("time-series queries", () => {
    beforeEach(async () => {
      // Create multiple readings at different times
      const now = new Date();
      
      await SensorReading.create({
        timestamp: new Date(now.getTime() - 3600000), // 1 hour ago
        value: 21.0,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.create({
        timestamp: new Date(now.getTime() - 1800000), // 30 min ago
        value: 22.0,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.create({
        timestamp: now,
        value: 23.0,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });
    });

    test("queries readings by time range", async () => {
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

    test("queries readings by sensor", async () => {
      const readings = await SensorReading.find({
        "metadata.sensor": sensorId,
      });

      expect(readings.length).toBe(3);
      expect(readings.every((r) => r.metadata.sensor.toString() === sensorId.toString())).toBe(
        true
      );
    });

    test("queries readings by building", async () => {
      const readings = await SensorReading.find({
        "metadata.building": buildingId,
      });

      expect(readings.length).toBe(3);
      expect(
        readings.every((r) => r.metadata.building.toString() === buildingId.toString())
      ).toBe(true);
    });

    test("queries readings by sensorType", async () => {
      const readings = await SensorReading.find({
        "metadata.sensorType": "internal_temp",
      });

      expect(readings.length).toBe(3);
      expect(readings.every((r) => r.metadata.sensorType === "internal_temp")).toBe(true);
    });

    test("sorts readings by timestamp", async () => {
      const readings = await SensorReading.find({
        "metadata.sensor": sensorId,
      }).sort({ timestamp: -1 });

      expect(readings.length).toBe(3);
      // Check descending order
      for (let i = 0; i < readings.length - 1; i++) {
        expect(readings[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
          readings[i + 1]!.timestamp.getTime()
        );
      }
    });

    test("gets latest reading for sensor", async () => {
      const latestReading = await SensorReading.findOne({
        "metadata.sensor": sensorId,
      }).sort({ timestamp: -1 });

      expect(latestReading).not.toBeNull();
      expect(latestReading!.value).toBe(23.0);
    });

    test("calculates average value over time range", async () => {
      const readings = await SensorReading.find({
        "metadata.sensor": sensorId,
      });

      const values = readings.map((r) => r.value);
      const average = values.reduce((sum, val) => sum + val, 0) / values.length;

      expect(average).toBe(22.0); // (21 + 22 + 23) / 3
    });
  });

  describe("multiple sensors", () => {
    let sensor2Id: Types.ObjectId;

    beforeEach(async () => {
      const sensor2 = await Sensor.create({
        building: buildingId,
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
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.create({
        timestamp: new Date(),
        value: 10.0,
        unit: "°C",
        metadata: {
          sensor: sensor2Id,
          building: buildingId,
          sensorType: "external_temp",
        },
      });
    });

    test("filters readings by specific sensor", async () => {
      const sensor1Readings = await SensorReading.find({
        "metadata.sensor": sensorId,
      });

      expect(sensor1Readings.length).toBe(1);
      expect(sensor1Readings[0]!.value).toBe(22.0);
    });

    test("gets all readings for a building", async () => {
      const buildingReadings = await SensorReading.find({
        "metadata.building": buildingId,
      });

      expect(buildingReadings.length).toBe(2);
    });

    test("filters by sensor type", async () => {
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

  describe("crud operations", () => {
    test("creates sensor reading", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      expect(reading._id).toBeDefined();
    });

    test("finds sensor reading by id", async () => {
      const created = await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      const found = await SensorReading.findById(created._id);

      expect(found).not.toBeNull();
      expect(found!.value).toBe(22.5);
    });

    test("deletes sensor reading", async () => {
      const reading = await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.deleteOne({ _id: reading._id });

      const found = await SensorReading.findById(reading._id);

      expect(found).toBeNull();
    });

    test("deletes multiple readings", async () => {
      await SensorReading.create({
        timestamp: new Date(),
        value: 21.0,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.create({
        timestamp: new Date(),
        value: 22.0,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.deleteMany({ "metadata.sensor": sensorId });

      const remaining = await SensorReading.find({ "metadata.sensor": sensorId });

      expect(remaining.length).toBe(0);
    });

    test("counts sensor readings", async () => {
      await SensorReading.create({
        timestamp: new Date(),
        value: 21.0,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      await SensorReading.create({
        timestamp: new Date(),
        value: 22.0,
        unit: "°C",
        metadata: {
          sensor: sensorId,
          building: buildingId,
          sensorType: "internal_temp",
        },
      });

      const count = await SensorReading.countDocuments({ "metadata.sensor": sensorId });

      expect(count).toBe(2);
    });
  });
});
