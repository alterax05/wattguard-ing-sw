import {
  describe,
  test,
  expect,
  beforeEach,
  spyOn,
} from "bun:test";
import { setupIntegrationTests } from "../helpers/db";
import { Sensor } from "../../models/Sensor";
import { Building, type BuildingDocument } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";
import { User } from "../../models/User";
import { Types, Error as MongooseError } from "mongoose";

setupIntegrationTests();

describe("Sensor schema", () => {
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

  describe("schema validation", () => {
    test("creates a sensor with all required fields", async () => {
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

      expect(sensor.building.toString()).toBe(buildingId.toString());
      expect(sensor.sensorType).toBe("internal_temp");
      expect(sensor.location).toBe("Sala Principale");
      expect(sensor.serialNumber).toBe("SN001");
      expect(sensor.installationDate).toBeInstanceOf(Date);
      expect(sensor.transmissionInterval).toBe(300);
      expect(sensor.status).toBe("active"); // default
      expect(sensor.createdBy.toString()).toBe(userId.toString());
      expect(sensor.updatedBy.toString()).toBe(userId.toString());
    });

    test("creates sensor without optional serialNumber", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "external_temp",
        location: "Esterno",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.serialNumber).toBeUndefined();
    });

    test("uses default transmissionInterval of 90 seconds", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "energy_meter",
        location: "Contatore",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.transmissionInterval).toBe(90);
    });

    test("uses default status of 'active'", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test Location",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.status).toBe("active");
    });

    test("fails without required building", async () => {
      await expect(
        Sensor.create({
          sensorType: "internal_temp",
          location: "Test Location",
          installationDate: new Date(),
          createdBy: userId,
          updatedBy: userId,
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });

    test("fails without required sensorType", async () => {
      await expect(
        Sensor.create({
          building: buildingId,
          location: "Test Location",
          installationDate: new Date(),
          createdBy: userId,
          updatedBy: userId,
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });

    test("fails without required location", async () => {
      await expect(
        Sensor.create({
          building: buildingId,
          sensorType: "internal_temp",
          installationDate: new Date(),
          createdBy: userId,
          updatedBy: userId,
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });

    test("trims whitespace from location", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "  Trimmed Location  ",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.location).toBe("Trimmed Location");
    });

    test("trims whitespace from serialNumber", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
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

  describe("sensorType enum validation", () => {
    test("accepts 'internal_temp' type", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Interior",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.sensorType).toBe("internal_temp");
    });

    test("accepts 'external_temp' type", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "external_temp",
        location: "Exterior",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.sensorType).toBe("external_temp");
    });

    test("accepts 'energy_meter' type", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "energy_meter",
        location: "Meter Room",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.sensorType).toBe("energy_meter");
    });

    test("fails with invalid sensor type", async () => {
      await expect(
        Sensor.create({
          building: buildingId,
          // @ts-expect-error deliberately invalid sensorType outside the enum
          sensorType: "invalid_type",
          location: "Test",
          installationDate: new Date(),
          createdBy: userId,
          updatedBy: userId,
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });
  });

  describe("status enum validation", () => {
    test("accepts 'active' status", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        status: "active",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.status).toBe("active");
    });

    test("accepts 'inactive' status", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        status: "inactive",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.status).toBe("inactive");
    });

    test("accepts 'maintenance' status", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        status: "maintenance",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.status).toBe("maintenance");
    });

    test("accepts 'error' status", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        status: "error",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.status).toBe("error");
    });

    test("fails with invalid status", async () => {
      await expect(
        Sensor.create({
          building: buildingId,
          sensorType: "internal_temp",
          location: "Test",
          installationDate: new Date(),
          // @ts-expect-error deliberately invalid status outside the enum
          status: "invalid",
          createdBy: userId,
          updatedBy: userId,
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });
  });

  describe("transmission interval validation", () => {
    test("accepts valid transmission interval", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 300,
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.transmissionInterval).toBe(300);
    });

    test("accepts minimum interval of 10 seconds", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 10,
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.transmissionInterval).toBe(10);
    });

    test("accepts maximum interval of 3600 seconds", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 3600,
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.transmissionInterval).toBe(3600);
    });

    test("fails with interval below 10 seconds", async () => {
      await expect(
        Sensor.create({
          building: buildingId,
          sensorType: "internal_temp",
          location: "Test",
          installationDate: new Date(),
          transmissionInterval: 5,
          createdBy: userId,
          updatedBy: userId,
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });

    test("fails with interval above 3600 seconds", async () => {
      await expect(
        Sensor.create({
          building: buildingId,
          sensorType: "internal_temp",
          location: "Test",
          installationDate: new Date(),
          transmissionInterval: 3700,
          createdBy: userId,
          updatedBy: userId,
        }),
      ).rejects.toThrow(MongooseError.ValidationError);
    });
  });

  describe("serial number unique constraint", () => {
    test("enforces unique serialNumber", async () => {
      await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Location 1",
        serialNumber: "SN-UNIQUE-001",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      await expect(
        Sensor.create({
          building: buildingId,
          sensorType: "external_temp",
          location: "Location 2",
          serialNumber: "SN-UNIQUE-001",
          installationDate: new Date(),
          createdBy: userId,
          updatedBy: userId,
        }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    test("allows multiple sensors without serialNumber (sparse index)", async () => {
      const sensor1 = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Location 1",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      const sensor2 = await Sensor.create({
        building: buildingId,
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

  describe("lastReading subdocument", () => {
    test("creates sensor with lastReading", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
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

    test("creates sensor without lastReading", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.lastReading).toBeUndefined();
    });

    test("updates lastReading", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
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

  describe("timestamps", () => {
    test("automatically sets timestamps", async () => {
      const before = new Date();
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });
      const after = new Date();

      expect(sensor.createdAt).toBeInstanceOf(Date);
      expect(sensor.updatedAt).toBeInstanceOf(Date);
      expect(sensor.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(sensor.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("updates updatedAt on modification", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
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

      expect(sensor.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe("isActive()", () => {
    test("returns false when sensor has no lastReading", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.isActive()).toBe(false);
    });

    test("returns true when elapsed time is within 2× transmissionInterval", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 90,
        lastReading: {
          value: 22,
          unit: "°C",
          timestamp: new Date(Date.now() - 100_000),
        },
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.isActive()).toBe(true);
    });

    test("returns true when elapsed time is at the 2× transmissionInterval boundary", async () => {
      const fixedNow = new Date("2026-01-01T00:00:00.000Z").getTime();
      const nowSpy = spyOn(Date, "now").mockReturnValue(fixedNow);
      try {
        const sensor = await Sensor.create({
          building: buildingId,
          sensorType: "internal_temp",
          location: "Test",
          installationDate: new Date(),
          transmissionInterval: 90,
          // Exactly 180 s ago — boundary should be active (strict >)
          lastReading: {
            value: 22,
            unit: "°C",
            timestamp: new Date(fixedNow - 180_000),
          },
          createdBy: userId,
          updatedBy: userId,
        });

        expect(sensor.isActive()).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
    });

    test("returns false when elapsed time exceeds 2× transmissionInterval", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        transmissionInterval: 90,
        lastReading: {
          value: 22,
          unit: "°C",
          timestamp: new Date(Date.now() - 300_000),
        },
        createdBy: userId,
        updatedBy: userId,
      });

      expect(sensor.isActive()).toBe(false);
    });

    test("respects each sensor's own transmissionInterval", async () => {
      const fastSensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Fast",
        installationDate: new Date(),
        transmissionInterval: 10,
        lastReading: {
          value: 1,
          unit: "°C",
          timestamp: new Date(Date.now() - 25_000),
        },
        createdBy: userId,
        updatedBy: userId,
      });

      const slowSensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Slow",
        installationDate: new Date(),
        transmissionInterval: 3600,
        lastReading: {
          value: 1,
          unit: "°C",
          timestamp: new Date(Date.now() - 25_000),
        },
        createdBy: userId,
        updatedBy: userId,
      });

      // 25 s > 2×10 = 20 s → inactive
      expect(fastSensor.isActive()).toBe(false);
      // 25 s < 2×3600 = 7200 s → active
      expect(slowSensor.isActive()).toBe(true);
    });
  });

  describe("crud operations", () => {
    test("finds sensor by id", async () => {
      const created = await Sensor.create({
        building: buildingId,
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

    test("finds sensors by building", async () => {
      await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Location 1",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      await Sensor.create({
        building: buildingId,
        sensorType: "external_temp",
        location: "Location 2",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      const sensors = await Sensor.find({ building: buildingId });

      expect(sensors.length).toBe(2);
    });

    test("filters sensors by sensorType", async () => {
      await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Interior",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      await Sensor.create({
        building: buildingId,
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

    test("filters sensors by status", async () => {
      await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Active",
        installationDate: new Date(),
        status: "active",
        createdBy: userId,
        updatedBy: userId,
      });

      await Sensor.create({
        building: buildingId,
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

    test("populates building reference", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
        sensorType: "internal_temp",
        location: "Test",
        installationDate: new Date(),
        createdBy: userId,
        updatedBy: userId,
      });

      const populated = await Sensor.findById(sensor._id).populate<{ building: BuildingDocument }>("building");

      expect(populated).not.toBeNull();
      expect(populated!.building.name).toBe("Test Building");
    });

    test("deletes sensor", async () => {
      const sensor = await Sensor.create({
        building: buildingId,
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
