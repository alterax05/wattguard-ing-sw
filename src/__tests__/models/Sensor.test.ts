import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { Sensor } from "../../models/Sensor";
import { Building, type IBuilding } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";
import { User } from "../../models/User";
import { Types, Error as MongooseError } from "mongoose";

describe("Sensor Model", () => {
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
      buildingType: buildingType._id,
      heatingSystemType: "caldaia_gas",
      geographicZone: "Centro",
      createdBy: userId,
      updatedBy: userId,
    });
    buildingId = building._id;
  });

  describe("Schema Validation", () => {
    test("should create a sensor with all required fields", async () => {
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

      expect(sensor.buildingId.toString()).toBe(buildingId.toString());
      expect(sensor.sensorType).toBe("internal_temp");
      expect(sensor.location).toBe("Sala Principale");
      expect(sensor.serialNumber).toBe("SN001");
      expect(sensor.installationDate).toBeInstanceOf(Date);
      expect(sensor.transmissionInterval).toBe(300);
      expect(sensor.status).toBe("active"); // default
      expect(sensor.createdBy.toString()).toBe(userId.toString());
      expect(sensor.updatedBy.toString()).toBe(userId.toString());
    });

    test("should create sensor without optional serialNumber", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "external_temp",
        location: "Esterno",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.serialNumber).toBeUndefined();
    });

    test("should use default transmissionInterval of 90 seconds", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "energy_meter",
        location: "Contatore",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.transmissionInterval).toBe(90);
    });

    test("should use default status of 'active'", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test Location",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.status).toBe("active");
    });

    test("should fail without required buildingId", async () => {
      try {
        await Sensor.create({
          sensorType: "internal_temp",
          location: "Test Location",
          installationDate: new Date(),
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.buildingId).toBeDefined();
      }
    });

    test("should fail without required sensorType", async () => {
      try {
        await Sensor.create({
          buildingId: buildingId,
          location: "Test Location",
          installationDate: new Date(),
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.sensorType).toBeDefined();
      }
    });

    test("should fail without required location", async () => {
      try {
        await Sensor.create({
          buildingId: buildingId,
          sensorType: "internal_temp",
          installationDate: new Date(),
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.location).toBeDefined();
      }
    });

    test("should trim whitespace from location", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "  Trimmed Location  ",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.location).toBe("Trimmed Location");
    });

    test("should trim whitespace from serialNumber", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        serialNumber: "  SN-TRIM-001  ",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.serialNumber).toBe("SN-TRIM-001");
    });
  });

  describe("SensorType Enum Validation", () => {
    test("should accept 'internal_temp' type", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Interior",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.sensorType).toBe("internal_temp");
    });

    test("should accept 'external_temp' type", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "external_temp",
        location: "Exterior",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.sensorType).toBe("external_temp");
    });

    test("should accept 'energy_meter' type", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "energy_meter",
        location: "Meter Room",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.sensorType).toBe("energy_meter");
    });

    test("should fail with invalid sensor type", async () => {
      try {
        await Sensor.create({
          buildingId: buildingId,
          sensorType: "invalid_type",
          location: "Test",
          installationDate: new Date(),
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.sensorType).toBeDefined();
      }
    });
  });

  describe("Status Enum Validation", () => {
    test("should accept 'active' status", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        status: "active",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.status).toBe("active");
    });

    test("should accept 'inactive' status", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        status: "inactive",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.status).toBe("inactive");
    });

    test("should accept 'maintenance' status", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        status: "maintenance",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.status).toBe("maintenance");
    });

    test("should accept 'error' status", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        status: "error",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.status).toBe("error");
    });

    test("should fail with invalid status", async () => {
      try {
        await Sensor.create({
          buildingId: buildingId,
          sensorType: "internal_temp",
          location: "Test",
          installationDate: new Date(),
          status: "invalid",
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.status).toBeDefined();
      }
    });
  });

  describe("Transmission Interval Validation", () => {
    test("should accept valid transmission interval", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 300,
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.transmissionInterval).toBe(300);
    });

    test("should accept minimum interval of 10 seconds", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 10,
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.transmissionInterval).toBe(10);
    });

    test("should accept maximum interval of 3600 seconds", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 3600,
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.transmissionInterval).toBe(3600);
    });

    test("should fail with interval below 10 seconds", async () => {
      try {
        await Sensor.create({
          buildingId: buildingId,
          sensorType: "internal_temp",
          location: "Test",
          installationDate: new Date(),
          transmissionInterval: 5,
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.transmissionInterval).toBeDefined();
      }
    });

    test("should fail with interval above 3600 seconds", async () => {
      try {
        await Sensor.create({
          buildingId: buildingId,
          sensorType: "internal_temp",
          location: "Test",
          installationDate: new Date(),
          transmissionInterval: 3700,
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.transmissionInterval).toBeDefined();
      }
    });
  });

  describe("Serial Number Unique Constraint", () => {
    test("should enforce unique serialNumber", async () => {
      await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Location 1",
        serialNumber: "SN-UNIQUE-001",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      try {
        await Sensor.create({
          buildingId: buildingId,
          sensorType: "external_temp",
          location: "Location 2",
          serialNumber: "SN-UNIQUE-001",
          installationDate: new Date(),
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as { code: number };
        expect(error.code).toBe(11000); // MongoDB duplicate key error
      }
    });

    test("should allow multiple sensors without serialNumber (sparse index)", async () => {
      const sensor1 = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Location 1",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      const sensor2 = await Sensor.create({
        buildingId: buildingId,
        sensorType: "external_temp",
        location: "Location 2",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor1.serialNumber).toBeUndefined();
      expect(sensor2.serialNumber).toBeUndefined();
    });
  });

  describe("Last Reading Subdocument", () => {
    test("should create sensor with lastReading", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        lastReading: {
          value: 22.5,
          timestamp: new Date(),
          unit: "°C",
        },
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.lastReading).toBeDefined();
      expect(sensor.lastReading!.value).toBe(22.5);
      expect(sensor.lastReading!.unit).toBe("°C");
      expect(sensor.lastReading!.timestamp).toBeInstanceOf(Date);
    });

    test("should create sensor without lastReading", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.lastReading).toBeUndefined();
    });

    test("should update lastReading", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      sensor.lastReading = {
        value: 23.0,
        timestamp: new Date(),
        unit: "°C",
      };
      await sensor.save();

      const updated = await Sensor.findById(sensor._id);
      expect(updated!.lastReading).toBeDefined();
      expect(updated!.lastReading!.value).toBe(23.0);
    });
  });

  describe("Timestamps", () => {
    test("should automatically set timestamps", async () => {
      const before = new Date();
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });
      const after = new Date();

      expect(sensor.createdAt).toBeInstanceOf(Date);
      expect(sensor.updatedAt).toBeInstanceOf(Date);
      expect(sensor.createdAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(sensor.createdAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("should update updatedAt on modification", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Original",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      const originalUpdatedAt = sensor.updatedAt;
      await new Promise((resolve) => setTimeout(resolve, 10));

      sensor.location = "Updated";
      await sensor.save();

      expect(sensor.updatedAt!.getTime()).toBeGreaterThan(originalUpdatedAt!.getTime());
    });
  });

  describe("CRUD Operations", () => {
    test("should find sensor by id", async () => {
      const created = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Findable",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      const found = await Sensor.findById(created._id);

      expect(found).not.toBeNull();
      expect(found!.location).toBe("Findable");
    });

    test("should find sensors by buildingId", async () => {
      await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Location 1",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      await Sensor.create({
        buildingId: buildingId,
        sensorType: "external_temp",
        location: "Location 2",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      const sensors = await Sensor.find({ buildingId: buildingId });

      expect(sensors.length).toBe(2);
    });

    test("should filter sensors by sensorType", async () => {
      await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Interior",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      await Sensor.create({
        buildingId: buildingId,
        sensorType: "energy_meter",
        location: "Meter",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      const tempSensors = await Sensor.find({ sensorType: "internal_temp" });

      expect(tempSensors.length).toBe(1);
      expect(tempSensors[0]!.location).toBe("Interior");
    });

    test("should filter sensors by status", async () => {
      await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Active",
        installationDate: new Date(),
        status: "active",
        createdBy: userId,
        updatedBy: userId,
      });

      await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Maintenance",
        installationDate: new Date(),
        status: "maintenance",
        createdBy: userId,
        updatedBy: userId,
      });

      const activeSensors = await Sensor.find({ status: "active" });

      expect(activeSensors.length).toBe(1);
      expect(activeSensors[0]!.location).toBe("Active");
    });

    test("should populate building reference", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      const populated = await Sensor.findById(sensor._id).populate("buildingId");

      expect(populated).not.toBeNull();
      expect((populated!.buildingId as unknown as IBuilding).name).toBe("Test Building");
    });

    test("should delete sensor", async () => {
      const sensor = await Sensor.create({
        buildingId: buildingId,
        sensorType: "internal_temp",
        location: "To Delete",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      await Sensor.deleteOne({ _id: sensor._id });

      const found = await Sensor.findById(sensor._id);

      expect(found).toBeNull();
    });
  });
});
