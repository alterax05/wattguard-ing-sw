import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { AuditLog } from "../../models/AuditLog";
import { Building } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";
import { Sensor } from "../../models/Sensor";
import { User } from "../../models/User";
import { Types } from "mongoose";

describe("AuditLog Model", () => {
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
    test("should create an audit log with all required fields", async () => {
      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: { created: { name: "Test Building" } },
        performedBy: userId,
        timestamp: new Date(),
      });

      expect(auditLog.entityType).toBe("building");
      expect(auditLog.entityId.toString()).toBe(buildingId.toString());
      expect(auditLog.action).toBe("create");
      expect(auditLog.changes).toBeDefined();
      expect(auditLog.performedBy.toString()).toBe(userId.toString());
      expect(auditLog.timestamp).toBeInstanceOf(Date);
      expect(auditLog._id).toBeDefined();
    });

    test("should use default timestamp if not provided", async () => {
      const before = new Date();
      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: { created: { name: "Test Building" } },
        performedBy: userId,
      });
      const after = new Date();

      expect(auditLog.timestamp).toBeInstanceOf(Date);
      expect(auditLog.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(auditLog.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("should fail without required entityType", async () => {
      try {
        await AuditLog.create({
          entityId: buildingId,
          action: "create",
          changes: {},
          performedBy: userId,
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors.entityType).toBeDefined();
      }
    });

    test("should fail without required entityId", async () => {
      try {
        await AuditLog.create({
          entityType: "building",
          action: "create",
          changes: {},
          performedBy: userId,
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors.entityId).toBeDefined();
      }
    });

    test("should fail without required action", async () => {
      try {
        await AuditLog.create({
          entityType: "building",
          entityId: buildingId,
          changes: {},
          performedBy: userId,
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors.action).toBeDefined();
      }
    });

    test("should fail without required changes", async () => {
      try {
        await AuditLog.create({
          entityType: "building",
          entityId: buildingId,
          action: "create",
          performedBy: userId,
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors.changes).toBeDefined();
      }
    });

    test("should fail without required performedBy", async () => {
      try {
        await AuditLog.create({
          entityType: "building",
          entityId: buildingId,
          action: "create",
          changes: {},
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors.performedBy).toBeDefined();
      }
    });
  });

  describe("EntityType Enum Validation", () => {
    test("should accept 'building' entity type", async () => {
      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId,
      });

      expect(auditLog.entityType).toBe("building");
    });

    test("should accept 'sensor' entity type", async () => {
      const auditLog = await AuditLog.create({
        entityType: "sensor",
        entityId: sensorId,
        action: "create",
        changes: {},
        performedBy: userId,
      });

      expect(auditLog.entityType).toBe("sensor");
    });

    test("should fail with invalid entity type", async () => {
      try {
        await AuditLog.create({
          entityType: "invalid" as any,
          entityId: buildingId,
          action: "create",
          changes: {},
          performedBy: userId,
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors.entityType).toBeDefined();
      }
    });
  });

  describe("Action Enum Validation", () => {
    test("should accept 'create' action", async () => {
      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: { created: {} },
        performedBy: userId,
      });

      expect(auditLog.action).toBe("create");
    });

    test("should accept 'update' action", async () => {
      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "update",
        changes: { before: {}, after: {} },
        performedBy: userId,
      });

      expect(auditLog.action).toBe("update");
    });

    test("should accept 'delete' action", async () => {
      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "delete",
        changes: { deleted: {} },
        performedBy: userId,
      });

      expect(auditLog.action).toBe("delete");
    });

    test("should fail with invalid action", async () => {
      try {
        await AuditLog.create({
          entityType: "building",
          entityId: buildingId,
          action: "invalid" as any,
          changes: {},
          performedBy: userId,
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.name).toBe("ValidationError");
        expect(error.errors.action).toBeDefined();
      }
    });
  });

  describe("Changes Field", () => {
    test("should store create changes", async () => {
      const changes = {
        created: {
          name: "New Building",
          address: "Via Nuova 1",
          surface: 1000,
        },
      };

      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: changes,
        performedBy: userId,
      });

      expect(auditLog.changes).toEqual(changes);
    });

    test("should store update changes with before/after", async () => {
      const changes = {
        before: { name: "Old Name", status: "active" },
        after: { name: "New Name", status: "inactive" },
      };

      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "update",
        changes: changes,
        performedBy: userId,
      });

      expect(auditLog.changes).toEqual(changes);
    });

    test("should store delete changes", async () => {
      const changes = {
        deleted: {
          name: "Deleted Building",
          address: "Via Deleted 1",
        },
      };

      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "delete",
        changes: changes,
        performedBy: userId,
      });

      expect(auditLog.changes).toEqual(changes);
    });

    test("should accept empty changes object", async () => {
      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "update",
        changes: {},
        performedBy: userId,
      });

      expect(auditLog.changes).toEqual({});
    });

    test("should accept nested changes", async () => {
      const changes = {
        before: {
          address: "Old Address",
          metadata: {
            zone: "North",
            type: "residential",
          },
        },
        after: {
          address: "New Address",
          metadata: {
            zone: "South",
            type: "commercial",
          },
        },
      };

      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "update",
        changes: changes,
        performedBy: userId,
      });

      expect(auditLog.changes).toEqual(changes);
    });
  });

  describe("Query Operations", () => {
    beforeEach(async () => {
      // Create multiple audit logs
      await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: { created: {} },
        performedBy: userId,
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
      });

      await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "update",
        changes: { before: {}, after: {} },
        performedBy: userId,
        timestamp: new Date(Date.now() - 1800000), // 30 min ago
      });

      await AuditLog.create({
        entityType: "sensor",
        entityId: sensorId,
        action: "create",
        changes: { created: {} },
        performedBy: userId,
        timestamp: new Date(),
      });
    });

    test("should find audit logs by entityType", async () => {
      const buildingLogs = await AuditLog.find({ entityType: "building" });

      expect(buildingLogs.length).toBe(2);
      expect(buildingLogs.every((log) => log.entityType === "building")).toBe(true);
    });

    test("should find audit logs by entityId", async () => {
      const logs = await AuditLog.find({ entityId: buildingId });

      expect(logs.length).toBe(2);
      expect(logs.every((log) => log.entityId.toString() === buildingId.toString())).toBe(true);
    });

    test("should find audit logs by action", async () => {
      const createLogs = await AuditLog.find({ action: "create" });

      expect(createLogs.length).toBe(2);
      expect(createLogs.every((log) => log.action === "create")).toBe(true);
    });

    test("should find audit logs by performedBy", async () => {
      const userLogs = await AuditLog.find({ performedBy: userId });

      expect(userLogs.length).toBe(3);
      expect(userLogs.every((log) => log.performedBy.toString() === userId.toString())).toBe(true);
    });

    test("should find audit logs by time range", async () => {
      const startTime = new Date(Date.now() - 2000000); // 33 min ago
      const endTime = new Date();

      const logs = await AuditLog.find({
        timestamp: {
          $gte: startTime,
          $lte: endTime,
        },
      });

      expect(logs.length).toBe(2); // Last two logs
    });

    test("should sort audit logs by timestamp descending", async () => {
      const logs = await AuditLog.find().sort({ timestamp: -1 });

      expect(logs.length).toBe(3);
      // Check descending order
      for (let i = 0; i < logs.length - 1; i++) {
        expect(logs[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
          logs[i + 1]!.timestamp.getTime()
        );
      }
    });

    test("should get latest audit log for entity", async () => {
      const latestLog = await AuditLog.findOne({ entityId: buildingId }).sort({ timestamp: -1 });

      expect(latestLog).not.toBeNull();
      expect(latestLog!.action).toBe("update");
    });

    test("should filter by multiple criteria", async () => {
      const logs = await AuditLog.find({
        entityType: "building",
        action: "create",
      });

      expect(logs.length).toBe(1);
      expect(logs[0]!.entityType).toBe("building");
      expect(logs[0]!.action).toBe("create");
    });

    test("should count audit logs", async () => {
      const count = await AuditLog.countDocuments({ entityId: buildingId });

      expect(count).toBe(2);
    });
  });

  describe("Compound Index Queries", () => {
    test("should efficiently query by entityType and entityId", async () => {
      await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId,
      });

      const logs = await AuditLog.find({
        entityType: "building",
        entityId: buildingId,
      });

      expect(logs.length).toBeGreaterThan(0);
    });

    test("should efficiently query by performedBy and timestamp", async () => {
      await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId,
      });

      const logs = await AuditLog.find({
        performedBy: userId,
      }).sort({ timestamp: -1 });

      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe("CRUD Operations", () => {
    test("should create audit log", async () => {
      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId,
      });

      expect(auditLog._id).toBeDefined();
    });

    test("should find audit log by id", async () => {
      const created = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId,
      });

      const found = await AuditLog.findById(created._id);

      expect(found).not.toBeNull();
      expect(found!.entityType).toBe("building");
    });

    test("should delete audit log", async () => {
      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId,
      });

      await AuditLog.deleteOne({ _id: auditLog._id });

      const found = await AuditLog.findById(auditLog._id);

      expect(found).toBeNull();
    });

    test("should delete multiple audit logs", async () => {
      await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId,
      });

      await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "update",
        changes: {},
        performedBy: userId,
      });

      await AuditLog.deleteMany({ entityId: buildingId });

      const remaining = await AuditLog.find({ entityId: buildingId });

      expect(remaining.length).toBe(0);
    });

    test("should populate performedBy reference", async () => {
      const auditLog = await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId,
      });

      const populated = await AuditLog.findById(auditLog._id).populate("performedBy");

      expect(populated).not.toBeNull();
      expect((populated!.performedBy as any).email).toBe("test@example.com");
    });
  });

  describe("Audit Trail Use Cases", () => {
    test("should track complete entity lifecycle", async () => {
      // Create
      await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: { created: { name: "New Building" } },
        performedBy: userId,
        timestamp: new Date(Date.now() - 7200000), // 2 hours ago
      });

      // Update
      await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "update",
        changes: {
          before: { name: "New Building" },
          after: { name: "Updated Building" },
        },
        performedBy: userId,
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
      });

      // Delete
      await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "delete",
        changes: { deleted: { name: "Updated Building" } },
        performedBy: userId,
        timestamp: new Date(),
      });

      const lifecycle = await AuditLog.find({ entityId: buildingId }).sort({ timestamp: 1 });

      expect(lifecycle.length).toBe(3);
      expect(lifecycle[0]!.action).toBe("create");
      expect(lifecycle[1]!.action).toBe("update");
      expect(lifecycle[2]!.action).toBe("delete");
    });

    test("should track who made each change", async () => {
      const user2 = await User.create({
        email: "user2@example.com",
        role: "operator",
        passwordHash: await Bun.password.hash("test123", { algorithm: "bcrypt", cost: 10 }),
      });

      await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "create",
        changes: {},
        performedBy: userId,
      });

      await AuditLog.create({
        entityType: "building",
        entityId: buildingId,
        action: "update",
        changes: {},
        performedBy: user2._id,
      });

      const user1Logs = await AuditLog.find({ performedBy: userId });
      const user2Logs = await AuditLog.find({ performedBy: user2._id });

      expect(user1Logs.length).toBe(1);
      expect(user2Logs.length).toBe(1);
    });
  });
});
