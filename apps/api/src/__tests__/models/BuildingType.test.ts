import { describe, test, expect } from "bun:test";
import { setupIntegrationTests } from "../helpers/db";
import { BuildingType } from "../../models/BuildingType";
import { Error as MongooseError } from "mongoose";

setupIntegrationTests(import.meta.path);

describe("BuildingType schema", () => {
  describe("schema validation", () => {
    test("creates a building type with required fields", async () => {
      const buildingType = await BuildingType.create({
        name: "Residenziale",
        description: "Edificio residenziale",
      });

      expect(buildingType.name).toBe("Residenziale");
      expect(buildingType.description).toBe("Edificio residenziale");
      expect(buildingType._id).toBeDefined();
      expect(buildingType.createdAt).toBeInstanceOf(Date);
      expect(buildingType.updatedAt).toBeInstanceOf(Date);
    });

    test("creates a building type without optional description", async () => {
      const buildingType = await BuildingType.create({
        name: "Commerciale",
      });

      expect(buildingType.name).toBe("Commerciale");
      expect(buildingType.description).toBeUndefined();
    });

    test("fails without required name field", async () => {
      try {
        await BuildingType.create({
          description: "Test description",
        });
        expect(true).toBe(false); // Should not reach here
      } catch (err) {
        const error = err as MongooseError.ValidationError;
        expect(error.name).toBe("ValidationError");
        expect(error.errors.name).toBeDefined();
      }
    });

    test("trims whitespace from name", async () => {
      const buildingType = await BuildingType.create({
        name: "  Industrial  ",
      });

      expect(buildingType.name).toBe("Industrial");
    });

    test("trims whitespace from description", async () => {
      const buildingType = await BuildingType.create({
        name: "Office",
        description: "  Large office building  ",
      });

      expect(buildingType.description).toBe("Large office building");
    });
  });

  describe("unique constraints", () => {
    test("enforces unique name constraint", async () => {
      await BuildingType.create({
        name: "Residenziale",
      });

      try {
        await BuildingType.create({
          name: "Residenziale",
        });
        expect(true).toBe(false); // Should not reach here
      } catch (err) {
        const error = err as { code: number };
        expect(error.code).toBe(11000); // MongoDB duplicate key error
      }
    });

    test("allows same name after deletion", async () => {
      const buildingType1 = await BuildingType.create({
        name: "Temporary",
      });

      await BuildingType.deleteOne({ _id: buildingType1._id });

      const buildingType2 = await BuildingType.create({
        name: "Temporary",
      });

      expect(buildingType2.name).toBe("Temporary");
    });
  });

  describe("timestamps", () => {
    test("automatically sets createdAt and updatedAt on creation", async () => {
      const before = new Date();
      const buildingType = await BuildingType.create({
        name: "Test Type",
      });
      const after = new Date();

      expect(buildingType.createdAt).toBeInstanceOf(Date);
      expect(buildingType.updatedAt).toBeInstanceOf(Date);
      expect(buildingType.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(buildingType.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(buildingType.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(buildingType.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("updates updatedAt timestamp on modification", async () => {
      const buildingType = await BuildingType.create({
        name: "Original Name",
      });

      const originalUpdatedAt = buildingType.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      buildingType.name = "Updated Name";
      await buildingType.save();

      expect(buildingType.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    test("does not change createdAt on update", async () => {
      const buildingType = await BuildingType.create({
        name: "Original Name",
      });

      const originalCreatedAt = buildingType.createdAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      buildingType.name = "Updated Name";
      await buildingType.save();

      expect(buildingType.createdAt.getTime()).toBe(originalCreatedAt.getTime());
    });
  });

  describe("crud operations", () => {
    test("finds building type by id", async () => {
      const created = await BuildingType.create({
        name: "Findable Type",
      });

      const found = await BuildingType.findById(created._id);

      expect(found).not.toBeNull();
      expect(found!.name).toBe("Findable Type");
    });

    test("finds building type by name", async () => {
      await BuildingType.create({
        name: "Searchable",
      });

      const found = await BuildingType.findOne({ name: "Searchable" });

      expect(found).not.toBeNull();
      expect(found!.name).toBe("Searchable");
    });

    test("updates building type", async () => {
      const buildingType = await BuildingType.create({
        name: "Old Name",
        description: "Old description",
      });

      buildingType.name = "New Name";
      buildingType.description = "New description";
      await buildingType.save();

      const updated = await BuildingType.findById(buildingType._id);

      expect(updated!.name).toBe("New Name");
      expect(updated!.description).toBe("New description");
    });

    test("deletes building type", async () => {
      const buildingType = await BuildingType.create({
        name: "To Delete",
      });

      await BuildingType.deleteOne({ _id: buildingType._id });

      const found = await BuildingType.findById(buildingType._id);

      expect(found).toBeNull();
    });

    test("lists all building types", async () => {
      await BuildingType.create({ name: "Type 1" });
      await BuildingType.create({ name: "Type 2" });
      await BuildingType.create({ name: "Type 3" });

      const buildingTypes = await BuildingType.find();

      expect(buildingTypes.length).toBe(3);
    });
  });

  describe("edge cases", () => {
    test("handles empty description", async () => {
      const buildingType = await BuildingType.create({
        name: "Empty Desc",
        description: "",
      });

      expect(buildingType.description).toBe("");
    });

    test("handles long name", async () => {
      const longName = "A".repeat(100);
      const buildingType = await BuildingType.create({
        name: longName,
      });

      expect(buildingType.name).toBe(longName);
    });

    test("handles long description", async () => {
      const longDescription = "A".repeat(1000);
      const buildingType = await BuildingType.create({
        name: "Long Desc Type",
        description: longDescription,
      });

      expect(buildingType.description).toBe(longDescription);
    });

    test("handles special characters in name", async () => {
      const specialName = "Type-123 (Special) & More";
      const buildingType = await BuildingType.create({
        name: specialName,
      });

      expect(buildingType.name).toBe(specialName);
    });
  });
});
