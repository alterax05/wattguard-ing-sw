import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { Building } from "../../models/Building";
import { BuildingType, type IBuildingType } from "../../models/BuildingType";
import { User } from "../../models/User";
import { Types, Error as MongooseError } from "mongoose";

describe("Building Model", () => {
  let userId: Types.ObjectId;
  let buildingTypeId: Types.ObjectId;

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    // Create a test user
    const user = await User.create({
      email: "test@example.com",
      role: "admin",
      passwordHash: await Bun.password.hash("test123", { algorithm: "bcrypt", cost: 10 }),
    });
    userId = user._id;

    // Create a test building type
    const buildingType = await BuildingType.create({
      name: "Residenziale",
      description: "Test building type",
    });
    buildingTypeId = buildingType._id;
  });

  describe("Schema Validation", () => {
    test("should create a building with all required fields", async () => {
      const building = await Building.create({
        name: "Test Building",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        status: "active",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.name).toBe("Test Building");
      expect(building.address).toBe("Via Test 1");
      expect(building.surface).toBe(1000);
      expect(building.buildingType!.toString()).toBe(buildingTypeId.toString());
      expect(building.heatingSystemType).toBe("caldaia_gas");
      expect(building.geographicZone).toBe("Centro");
      expect(building.status).toBe("active");
      expect(building.createdBy.toString()).toBe(userId.toString());
      expect(building.updatedBy.toString()).toBe(userId.toString());
      expect(building._id).toBeDefined();
      expect(building.createdAt).toBeInstanceOf(Date);
      expect(building.updatedAt).toBeInstanceOf(Date);
    });

    test("should create a building with optional constructionYear", async () => {
      const building = await Building.create({
        name: "Old Building",
        address: "Via Antica 1",
        surface: 1500,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        constructionYear: 1950,
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.constructionYear).toBe(1950);
    });

    test("should use default status of 'active' if not provided", async () => {
      const building = await Building.create({
        name: "Default Status Building",
        address: "Via Default 1",
        surface: 800,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "pompa_calore",
        geographicZone: "Periferia",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.status).toBe("active");
    });

    test("should fail without required name field", async () => {
      try {
        await Building.create({
          address: "Via Test 1",
          surface: 1000,
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          buildingType: buildingTypeId,
          heatingSystemType: "caldaia_gas",
          geographicZone: "Centro",
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.name).toBeDefined();
      }
    });

    test("should fail without required address field", async () => {
      try {
        await Building.create({
          name: "Test Building",
          surface: 1000,
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          buildingType: buildingTypeId,
          heatingSystemType: "caldaia_gas",
          geographicZone: "Centro",
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.address).toBeDefined();
      }
    });

    test("should fail without required surface field", async () => {
      try {
        await Building.create({
          name: "Test Building",
          address: "Via Test 1",
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          buildingType: buildingTypeId,
          heatingSystemType: "caldaia_gas",
          geographicZone: "Centro",
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.surface).toBeDefined();
      }
    });

    test("should fail without required buildingType field", async () => {
      try {
        await Building.create({
          name: "Test Building",
          address: "Via Test 1",
          surface: 1000,
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          heatingSystemType: "caldaia_gas",
          geographicZone: "Centro",
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.buildingType).toBeDefined();
      }
    });

    test("should fail without required createdBy field", async () => {
      try {
        await Building.create({
          name: "Test Building",
          address: "Via Test 1",
          surface: 1000,
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          buildingType: buildingTypeId,
          heatingSystemType: "caldaia_gas",
          geographicZone: "Centro",
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.createdBy).toBeDefined();
      }
    });

    test("should trim whitespace from name", async () => {
      const building = await Building.create({
        name: "  Trimmed Building  ",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.name).toBe("Trimmed Building");
    });

    test("should trim whitespace from address", async () => {
      const building = await Building.create({
        name: "Test Building",
        address: "  Via Test 1  ",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.address).toBe("Via Test 1");
    });
  });

  describe("Surface Validation", () => {
    test("should accept positive surface values", async () => {
      const building = await Building.create({
        name: "Large Building",
        address: "Via Grande 1",
        surface: 50000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "teleriscaldamento",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.surface).toBe(50000);
    });

    test("should fail with negative surface value", async () => {
      try {
        await Building.create({
          name: "Invalid Building",
          address: "Via Test 1",
          surface: -100,
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          buildingType: buildingTypeId,
          heatingSystemType: "caldaia_gas",
          geographicZone: "Centro",
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.surface).toBeDefined();
      }
    });

    //TODO: Fix this
    test("should accept surface of 0", async () => {
      const building = await Building.create({
        name: "Zero Surface",
        address: "Via Test 1",
        surface: 0,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.surface).toBe(0);
    });
  });

  describe("Construction Year Validation", () => {
    test("should accept valid construction year", async () => {
      const building = await Building.create({
        name: "Historic Building",
        address: "Via Storica 1",
        surface: 2000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        constructionYear: 1850,
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.constructionYear).toBe(1850);
    });

    test("should accept current year", async () => {
      const currentYear = new Date().getFullYear();
      const building = await Building.create({
        name: "New Building",
        address: "Via Nuova 1",
        surface: 1200,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "pompa_calore",
        geographicZone: "Periferia",
        constructionYear: currentYear,
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.constructionYear).toBe(currentYear);
    });

    test("should fail with construction year below 1000", async () => {
      try {
        await Building.create({
          name: "Ancient Building",
          address: "Via Antica 1",
          surface: 1000,
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          buildingType: buildingTypeId,
          heatingSystemType: "caldaia_gas",
          geographicZone: "Centro",
          constructionYear: 999,
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.constructionYear).toBeDefined();
      }
    });

    test("should fail with construction year too far in future", async () => {
      const farFuture = new Date().getFullYear() + 20;
      try {
        await Building.create({
          name: "Future Building",
          address: "Via Futura 1",
          surface: 1000,
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          buildingType: buildingTypeId,
          heatingSystemType: "caldaia_gas",
          geographicZone: "Centro",
          constructionYear: farFuture,
          createdBy: userId,
          updatedBy: userId,
        });
        expect(true).toBe(false);
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.constructionYear).toBeDefined();
      }
    });
  });

  describe("Status Enum Validation", () => {
    test("should accept 'active' status", async () => {
      const building = await Building.create({
        name: "Active Building",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        status: "active",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.status).toBe("active");
    });

    test("should accept 'inactive' status", async () => {
      const building = await Building.create({
        name: "Inactive Building",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        status: "inactive",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.status).toBe("inactive");
    });

    test("should accept 'decommissioned' status", async () => {
      const building = await Building.create({
        name: "Decommissioned Building",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        status: "decommissioned",
        createdBy: userId,
        updatedBy: userId,
      });

      expect(building.status).toBe("decommissioned");
    });

    test("should fail with invalid status", async () => {
      try {
        await Building.create({
          name: "Invalid Status Building",
          address: "Via Test 1",
          surface: 1000,
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          buildingType: buildingTypeId,
          heatingSystemType: "caldaia_gas",
          geographicZone: "Centro",
          status: "invalid_status",
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

  describe("Timestamps", () => {
    test("should automatically set createdAt and updatedAt on creation", async () => {
      const before = new Date();
      const building = await Building.create({
        name: "Timestamp Test",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });
      const after = new Date();

      expect(building.createdAt).toBeInstanceOf(Date);
      expect(building.updatedAt).toBeInstanceOf(Date);
      expect(building.createdAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(building.createdAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("should update updatedAt on modification", async () => {
      const building = await Building.create({
        name: "Original Name",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      const originalUpdatedAt = building.updatedAt;
      await new Promise((resolve) => setTimeout(resolve, 10));

      building.name = "Updated Name";
      await building.save();

      expect(building.updatedAt!.getTime()).toBeGreaterThan(originalUpdatedAt!.getTime());
    });

    test("should not change createdAt on update", async () => {
      const building = await Building.create({
        name: "Original Name",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      const originalCreatedAt = building.createdAt;
      await new Promise((resolve) => setTimeout(resolve, 10));

      building.name = "Updated Name";
      await building.save();

      expect(building.createdAt!.getTime()).toBe(originalCreatedAt!.getTime());
    });
  });

  describe("CRUD Operations", () => {
    test("should find building by id", async () => {
      const created = await Building.create({
        name: "Findable Building",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      const found = await Building.findById(created._id);

      expect(found).not.toBeNull();
      expect(found!.name).toBe("Findable Building");
    });

    test("should find building by name", async () => {
      await Building.create({
        name: "Searchable Building",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      const found = await Building.findOne({ name: "Searchable Building" });

      expect(found).not.toBeNull();
      expect(found!.name).toBe("Searchable Building");
    });

    test("should update building", async () => {
      const building = await Building.create({
        name: "Old Name",
        address: "Old Address",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      building.name = "New Name";
      building.address = "New Address";
      await building.save();

      const updated = await Building.findById(building._id);

      expect(updated!.name).toBe("New Name");
      expect(updated!.address).toBe("New Address");
    });

    test("should delete building", async () => {
      const building = await Building.create({
        name: "To Delete",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      await Building.deleteOne({ _id: building._id });

      const found = await Building.findById(building._id);

      expect(found).toBeNull();
    });

    test("should filter buildings by status", async () => {
      await Building.create({
        name: "Active 1",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        status: "active",
        createdBy: userId,
        updatedBy: userId,
      });

      await Building.create({
        name: "Inactive 1",
        address: "Via Test 2",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        status: "inactive",
        createdBy: userId,
        updatedBy: userId,
      });

      const activeBuildings = await Building.find({ status: "active" });

      expect(activeBuildings.length).toBe(1);
      expect(activeBuildings[0]!.name).toBe("Active 1");
    });

    test("should filter buildings by geographic zone", async () => {
      await Building.create({
        name: "Centro Building",
        address: "Via Centro 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      await Building.create({
        name: "Periferia Building",
        address: "Via Periferia 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Periferia",
        createdBy: userId,
        updatedBy: userId,
      });

      const centroBuildings = await Building.find({ geographicZone: "Centro" });

      expect(centroBuildings.length).toBe(1);
      expect(centroBuildings[0]!.name).toBe("Centro Building");
    });

    test("should populate buildingType reference", async () => {
      const building = await Building.create({
        name: "Test Building",
        address: "Via Test 1",
        surface: 1000,
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        buildingType: buildingTypeId,
        heatingSystemType: "caldaia_gas",
        geographicZone: "Centro",
        createdBy: userId,
        updatedBy: userId,
      });

      const populated = await Building.findById(building._id).populate("buildingType");

      expect(populated).not.toBeNull();
      expect((populated!.buildingType as IBuildingType).name).toBe("Residenziale");
    });
  });
});
