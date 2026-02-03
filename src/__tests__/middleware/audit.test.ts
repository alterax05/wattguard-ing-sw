import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import {
  createAuditLog,
  logCreate,
  logUpdate,
  logDelete,
  captureChanges,
} from "../../middleware/audit";
import { AuditLog } from "../../models/AuditLog";
import { Building } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";
import { Sensor } from "../../models/Sensor";
import { User } from "../../models/User";
import { Types } from "mongoose";

describe("Audit Middleware", () => {
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

  describe("createAuditLog", () => {
    test("should create audit log with all fields", async () => {
      await createAuditLog({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: { created: { name: "Test" } },
        performedBy: userId,
      });

      const logs = await AuditLog.find({ entityId: buildingId });

      expect(logs.length).toBe(1);
      expect(logs[0]!.entityType).toBe("building");
      expect(logs[0]!.entityId.toString()).toBe(buildingId.toString());
      expect(logs[0]!.action).toBe("create");
      expect(logs[0]!.performedBy.toString()).toBe(userId.toString());
      expect(logs[0]!.changes).toEqual({ created: { name: "Test" } });
    });

    test("should create audit log for sensor entity", async () => {
      await createAuditLog({
        entityType: "sensor",
        entityId: sensorId,
        action: "update",
        changes: { before: {}, after: {} },
        performedBy: userId,
      });

      const logs = await AuditLog.find({ entityId: sensorId });

      expect(logs.length).toBe(1);
      expect(logs[0]!.entityType).toBe("sensor");
      expect(logs[0]!.action).toBe("update");
    });

    test("should accept string entityId", async () => {
      await createAuditLog({
        entityType: "building",
        entityId: buildingId.toString(),
        action: "create",
        changes: {},
        performedBy: userId,
      });

      const logs = await AuditLog.find({ entityId: buildingId });

      expect(logs.length).toBe(1);
    });

    test("should accept string performedBy", async () => {
      await createAuditLog({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId.toString(),
      });

      const logs = await AuditLog.find({ performedBy: userId });

      expect(logs.length).toBe(1);
    });

    test("should not throw error on failure", async () => {
      // This should fail validation but not throw
      await createAuditLog({
        entityType: "invalid" as any,
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId,
      });

      // Function should not throw, just log error
      expect(true).toBe(true);
    });

    test("should set timestamp automatically", async () => {
      const before = new Date();
      await createAuditLog({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId,
      });
      const after = new Date();

      const logs = await AuditLog.find({ entityId: buildingId });

      expect(logs[0]!.timestamp).toBeInstanceOf(Date);
      expect(logs[0]!.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(logs[0]!.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("logCreate", () => {
    test("should log create action for building", async () => {
      const building = await Building.findById(buildingId);

      await logCreate("building", buildingId, building!.toObject(), userId);

      const logs = await AuditLog.find({ entityId: buildingId });

      expect(logs.length).toBe(1);
      expect(logs[0]!.action).toBe("create");
      expect(logs[0]!.changes.created).toBeDefined();
      expect(logs[0]!.changes.created.name).toBe("Test Building");
    });

    test("should log create action for sensor", async () => {
      const sensor = await Sensor.findById(sensorId);

      await logCreate("sensor", sensorId, sensor!.toObject(), userId);

      const logs = await AuditLog.find({ entityId: sensorId });

      expect(logs.length).toBe(1);
      expect(logs[0]!.action).toBe("create");
      expect(logs[0]!.entityType).toBe("sensor");
    });

    test("should store complete entity data in changes", async () => {
      const building = await Building.findById(buildingId);

      await logCreate("building", buildingId, building!.toObject(), userId);

      const logs = await AuditLog.find({ entityId: buildingId });

      expect(logs[0]!.changes.created).toBeDefined();
      expect(logs[0]!.changes.created.name).toBe("Test Building");
      expect(logs[0]!.changes.created.address).toBe("Via Test 1");
      expect(logs[0]!.changes.created.surface).toBe(1000);
    });
  });

  describe("logUpdate", () => {
    test("should log update action with before/after", async () => {
      const oldEntity = { name: "Old Name", status: "active" };
      const newEntity = { name: "New Name", status: "inactive" };

      await logUpdate("building", buildingId, oldEntity, newEntity, userId);

      const logs = await AuditLog.find({ entityId: buildingId });

      expect(logs.length).toBe(1);
      expect(logs[0]!.action).toBe("update");
      expect(logs[0]!.changes.before).toBeDefined();
      expect(logs[0]!.changes.after).toBeDefined();
    });

    test("should capture only changed fields", async () => {
      const oldEntity = {
        name: "Test Building",
        address: "Old Address",
        surface: 1000,
        status: "active",
      };
      const newEntity = {
        name: "Test Building",
        address: "New Address",
        surface: 1000,
        status: "active",
      };

      await logUpdate("building", buildingId, oldEntity, newEntity, userId);

      const logs = await AuditLog.find({ entityId: buildingId });

      expect(logs[0]!.changes.before.address).toBe("Old Address");
      expect(logs[0]!.changes.after.address).toBe("New Address");
      // Unchanged fields should not be in changes
      expect(logs[0]!.changes.before.name).toBeUndefined();
      expect(logs[0]!.changes.after.name).toBeUndefined();
    });

    test("should handle multiple field changes", async () => {
      const oldEntity = { name: "Old Name", address: "Old Address", surface: 1000 };
      const newEntity = { name: "New Name", address: "New Address", surface: 2000 };

      await logUpdate("building", buildingId, oldEntity, newEntity, userId);

      const logs = await AuditLog.find({ entityId: buildingId });

      expect(logs[0]!.changes.before.name).toBe("Old Name");
      expect(logs[0]!.changes.after.name).toBe("New Name");
      expect(logs[0]!.changes.before.address).toBe("Old Address");
      expect(logs[0]!.changes.after.address).toBe("New Address");
      expect(logs[0]!.changes.before.surface).toBe(1000);
      expect(logs[0]!.changes.after.surface).toBe(2000);
    });
  });

  describe("logDelete", () => {
    test("should log delete action", async () => {
      const building = await Building.findById(buildingId);

      await logDelete("building", buildingId, building!.toObject(), userId);

      const logs = await AuditLog.find({ entityId: buildingId });

      expect(logs.length).toBe(1);
      expect(logs[0]!.action).toBe("delete");
      expect(logs[0]!.changes.deleted).toBeDefined();
    });

    test("should store deleted entity data", async () => {
      const building = await Building.findById(buildingId);

      await logDelete("building", buildingId, building!.toObject(), userId);

      const logs = await AuditLog.find({ entityId: buildingId });

      expect(logs[0]!.changes.deleted.name).toBe("Test Building");
      expect(logs[0]!.changes.deleted.address).toBe("Via Test 1");
    });

    test("should log sensor deletion", async () => {
      const sensor = await Sensor.findById(sensorId);

      await logDelete("sensor", sensorId, sensor!.toObject(), userId);

      const logs = await AuditLog.find({ entityId: sensorId });

      expect(logs.length).toBe(1);
      expect(logs[0]!.entityType).toBe("sensor");
      expect(logs[0]!.action).toBe("delete");
    });
  });

  describe("captureChanges", () => {
    test("should capture all changed fields", async () => {
      const oldObject = { name: "Old", status: "active", value: 100 };
      const newObject = { name: "New", status: "inactive", value: 200 };

      const changes = captureChanges(oldObject, newObject);

      expect(changes.before.name).toBe("Old");
      expect(changes.after.name).toBe("New");
      expect(changes.before.status).toBe("active");
      expect(changes.after.status).toBe("inactive");
      expect(changes.before.value).toBe(100);
      expect(changes.after.value).toBe(200);
    });

    test("should not capture unchanged fields", async () => {
      const oldObject = { name: "Same", status: "active" };
      const newObject = { name: "Same", status: "inactive" };

      const changes = captureChanges(oldObject, newObject);

      expect(changes.before.name).toBeUndefined();
      expect(changes.after.name).toBeUndefined();
      expect(changes.before.status).toBe("active");
      expect(changes.after.status).toBe("inactive");
    });

    test("should exclude internal fields", async () => {
      const oldObject = {
        name: "Test",
        __v: 0,
        _id: new Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const newObject = {
        name: "Updated",
        __v: 1,
        _id: oldObject._id,
        createdAt: oldObject.createdAt,
        updatedAt: new Date(),
      };

      const changes = captureChanges(oldObject, newObject);

      expect(changes.before.__v).toBeUndefined();
      expect(changes.after.__v).toBeUndefined();
      expect(changes.before._id).toBeUndefined();
      expect(changes.after._id).toBeUndefined();
      expect(changes.before.createdAt).toBeUndefined();
      expect(changes.after.createdAt).toBeUndefined();
      expect(changes.before.updatedAt).toBeUndefined();
      expect(changes.after.updatedAt).toBeUndefined();
    });

    test("should handle added fields", async () => {
      const oldObject = { name: "Test" };
      const newObject = { name: "Test", newField: "New Value" };

      const changes = captureChanges(oldObject, newObject);

      expect(changes.before.newField).toBeUndefined();
      expect(changes.after.newField).toBe("New Value");
    });

    test("should handle removed fields", async () => {
      const oldObject = { name: "Test", oldField: "Old Value" };
      const newObject = { name: "Test" };

      const changes = captureChanges(oldObject, newObject);

      expect(changes.before.oldField).toBe("Old Value");
      expect(changes.after.oldField).toBeUndefined();
    });

    test("should handle nested objects", async () => {
      const oldObject = { name: "Test", metadata: { zone: "North", type: "A" } };
      const newObject = { name: "Test", metadata: { zone: "South", type: "A" } };

      const changes = captureChanges(oldObject, newObject);

      expect(changes.before.metadata).toEqual({ zone: "North", type: "A" });
      expect(changes.after.metadata).toEqual({ zone: "South", type: "A" });
    });

    test("should handle array changes", async () => {
      const oldObject = { tags: ["tag1", "tag2"] };
      const newObject = { tags: ["tag1", "tag3"] };

      const changes = captureChanges(oldObject, newObject);

      expect(changes.before.tags).toEqual(["tag1", "tag2"]);
      expect(changes.after.tags).toEqual(["tag1", "tag3"]);
    });

    test("should handle null values", async () => {
      const oldObject = { name: "Test", value: null };
      const newObject = { name: "Test", value: 100 };

      const changes = captureChanges(oldObject, newObject);

      expect(changes.before.value).toBe(null);
      expect(changes.after.value).toBe(100);
    });

    test("should return empty changes for identical objects", async () => {
      const oldObject = { name: "Test", status: "active", value: 100 };
      const newObject = { name: "Test", status: "active", value: 100 };

      const changes = captureChanges(oldObject, newObject);

      expect(Object.keys(changes.before).length).toBe(0);
      expect(Object.keys(changes.after).length).toBe(0);
    });
  });

  describe("Integration with Routes", () => {
    test("should create audit log when building is created via route", async () => {
      const initialCount = await AuditLog.countDocuments();

      // Simulate what happens in the route
      const building = await Building.create({
        name: "New Building",
        address: "Via Nuova 1",
        surface: 1500,
        buildingType: new Types.ObjectId(),
        heatingSystemType: "pompa_calore",
        geographicZone: "Periferia",
        createdBy: userId,
        updatedBy: userId,
      });

      await logCreate("building", building._id, building.toObject(), userId);

      const finalCount = await AuditLog.countDocuments();

      expect(finalCount).toBe(initialCount + 1);
    });

    test("should create audit log when sensor is updated", async () => {
      const sensor = await Sensor.findById(sensorId);
      const oldData = sensor!.toObject();

      sensor!.status = "maintenance";
      await sensor!.save();

      await logUpdate("sensor", sensorId, oldData, sensor!.toObject(), userId);

      const logs = await AuditLog.find({ entityId: sensorId, action: "update" });

      expect(logs.length).toBe(1);
      expect(logs[0]!.changes.before.status).toBe("active");
      expect(logs[0]!.changes.after.status).toBe("maintenance");
    });

    test("should track multiple operations on same entity", async () => {
      const building = await Building.findById(buildingId);

      // Create
      await logCreate("building", buildingId, building!.toObject(), userId);

      // Update 1
      const oldData1 = building!.toObject();
      building!.name = "Updated Name 1";
      await building!.save();
      await logUpdate("building", buildingId, oldData1, building!.toObject(), userId);

      // Update 2
      const oldData2 = building!.toObject();
      building!.status = "inactive";
      await building!.save();
      await logUpdate("building", buildingId, oldData2, building!.toObject(), userId);

      // Delete
      await logDelete("building", buildingId, building!.toObject(), userId);

      const logs = await AuditLog.find({ entityId: buildingId }).sort({ timestamp: 1 });

      expect(logs.length).toBe(4);
      expect(logs[0]!.action).toBe("create");
      expect(logs[1]!.action).toBe("update");
      expect(logs[2]!.action).toBe("update");
      expect(logs[3]!.action).toBe("delete");
    });
  });
});
