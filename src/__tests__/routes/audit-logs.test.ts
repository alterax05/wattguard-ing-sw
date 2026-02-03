import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { Building } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";
import { Sensor } from "../../models/Sensor";
import { AuditLog } from "../../models/AuditLog";
import { createAuditLog, logCreate, logUpdate, logDelete } from "../../middleware/audit";
import { Types } from "mongoose";

describe("Audit Logs API", () => {
  let adminToken: string;
  let operatorToken: string;
  let adminUserId: string;
  let operatorUserId: string;
  let buildingTypeId: string;
  let buildingId: string;
  let sensorId: string;

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    // Create admin user
    const adminPasswordHash = await Bun.password.hash("admin123", {
      algorithm: "bcrypt",
      cost: 10,
    });

    const admin = await User.create({
      email: "admin@test.com",
      role: "admin",
      passwordHash: adminPasswordHash,
    });
    adminUserId = admin._id.toString();

    // Create operator user
    const operatorPasswordHash = await Bun.password.hash("operator123", {
      algorithm: "bcrypt",
      cost: 10,
    });

    const operator = await User.create({
      email: "operator@test.com",
      role: "operator",
      passwordHash: operatorPasswordHash,
    });
    operatorUserId = operator._id.toString();

    // Login as admin
    const adminLoginRes = await app.request("/api/auth/local/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "admin123" }),
    });

    const adminCookie = adminLoginRes.headers.get("set-cookie");
    const adminTokenMatch = adminCookie?.match(/access_token=([^;]+)/);
    adminToken = adminTokenMatch?.[1] ?? "";

    // Login as operator
    const operatorLoginRes = await app.request("/api/auth/local/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "operator@test.com", password: "operator123" }),
    });

    const operatorCookie = operatorLoginRes.headers.get("set-cookie");
    const operatorTokenMatch = operatorCookie?.match(/access_token=([^;]+)/);
    operatorToken = operatorTokenMatch?.[1] ?? "";

    // Create test building type
    const buildingType = await BuildingType.create({
      name: "Residenziale",
      description: "Edificio residenziale",
    });
    buildingTypeId = buildingType._id.toString();

    // Create test building
    const building = await Building.create({
      name: "Test Building",
      address: "Via Test 1",
      geographicZone: "Centro",
      buildingType: buildingType._id,
      surface: 1000,
      heatingSystemType: "caldaia_gas",
      status: "active",
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    buildingId = building._id.toString();

    // Create test sensor
    const sensor = await Sensor.create({
      serialNumber: "SN001",
      sensorType: "internal_temp",
      location: "Sala Principale",
      installationDate: new Date("2024-01-01"),
      buildingId: building._id,
      transmissionInterval: 300,
      status: "active",
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    sensorId = sensor._id.toString();

    // Create some audit logs
    await logCreate("building", building._id, building.toObject(), admin._id);
    await logCreate("sensor", sensor._id, sensor.toObject(), admin._id);
    await logUpdate(
      "building",
      building._id,
      { status: "active" },
      { status: "inactive" },
      operator._id
    );
  });

  describe("GET /api/audit-logs", () => {
    test("should list all audit logs for admin", async () => {
      const res = await app.request("/api/audit-logs", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.logs).toBeDefined();
      expect(Array.isArray(data.logs)).toBe(true);
      expect(data.logs.length).toBeGreaterThan(0);
      expect(data.total).toBeGreaterThan(0);
      expect(data.page).toBe(1);
      expect(data.limit).toBe(50);
      expect(data.totalPages).toBeGreaterThan(0);

      // Verify log structure
      const log = data.logs[0];
      expect(log._id).toBeDefined();
      expect(log.entityType).toBeDefined();
      expect(log.entityId).toBeDefined();
      expect(log.action).toBeDefined();
      expect(log.performedBy).toBeDefined();
      expect(log.timestamp).toBeDefined();
    });

    test("should filter logs by entityType", async () => {
      const res = await app.request("/api/audit-logs?entityType=building", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.logs.every((log: any) => log.entityType === "building")).toBe(true);
    });

    test("should filter logs by action", async () => {
      const res = await app.request("/api/audit-logs?action=create", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.logs.every((log: any) => log.action === "create")).toBe(true);
    });

    test("should filter logs by performedBy", async () => {
      const res = await app.request(`/api/audit-logs?performedBy=${operatorUserId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.logs.every((log: any) => log.performedBy === operatorUserId)).toBe(true);
    });

    test("should filter logs by date range", async () => {
      // Use a range that includes the current time since tests just created logs
      const startDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
      const endDate = new Date(Date.now() + 60000).toISOString(); // 1 minute from now

      const res = await app.request(
        `/api/audit-logs?startDate=${startDate}&endDate=${endDate}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.logs.length).toBeGreaterThan(0);
      
      // Verify all logs are within the date range
      for (const log of data.logs) {
        const logTimestamp = new Date(log.timestamp).getTime();
        expect(logTimestamp).toBeGreaterThanOrEqual(new Date(startDate).getTime());
        expect(logTimestamp).toBeLessThanOrEqual(new Date(endDate).getTime());
      }
    });

    test("should support pagination", async () => {
      const res = await app.request("/api/audit-logs?page=1&limit=2", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.logs.length).toBeLessThanOrEqual(2);
      expect(data.page).toBe(1);
      expect(data.limit).toBe(2);
    });

    test("should return 401 for unauthenticated request", async () => {
      const res = await app.request("/api/audit-logs");
      expect(res.status).toBe(401);
    });

    test("should return 403 for non-admin user", async () => {
      const res = await app.request("/api/audit-logs", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/audit-logs/:entityType/:entityId", () => {
    test("should get audit logs for a specific building", async () => {
      const res = await app.request(`/api/audit-logs/building/${buildingId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.logs).toBeDefined();
      expect(Array.isArray(data.logs)).toBe(true);
      expect(data.logs.length).toBeGreaterThan(0);
      expect(data.total).toBeGreaterThan(0);

      // All logs should be for this building
      expect(data.logs.every((log: any) => log.entityId === buildingId)).toBe(true);
      expect(data.logs.every((log: any) => log.entityType === "building")).toBe(true);
    });

    test("should get audit logs for a specific sensor", async () => {
      const res = await app.request(`/api/audit-logs/sensor/${sensorId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.logs).toBeDefined();
      expect(data.logs.length).toBeGreaterThan(0);
      expect(data.logs.every((log: any) => log.entityId === sensorId)).toBe(true);
      expect(data.logs.every((log: any) => log.entityType === "sensor")).toBe(true);
    });

    test("should return 404 for entity with no logs", async () => {
      const nonExistentId = new Types.ObjectId().toString();
      const res = await app.request(`/api/audit-logs/building/${nonExistentId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("should return 400 for invalid entityId format", async () => {
      const res = await app.request("/api/audit-logs/building/invalid-id", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(400);
    });

    test("should return 400 for invalid entityType", async () => {
      const res = await app.request(`/api/audit-logs/invalid-type/${buildingId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(400);
    });

    test("should return 401 for unauthenticated request", async () => {
      const res = await app.request(`/api/audit-logs/building/${buildingId}`);
      expect(res.status).toBe(401);
    });

    test("should return 403 for non-admin user", async () => {
      const res = await app.request(`/api/audit-logs/building/${buildingId}`, {
        headers: { Authorization: `Bearer ${operatorToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("Audit Log Creation", () => {
    test("should create audit log on building creation", async () => {
      const initialCount = await AuditLog.countDocuments({ action: "create", entityType: "building" });

      await app.request("/api/buildings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "New Building",
          address: "Via Nuova 1",
          geographicZone: "Periferia",
          buildingType: buildingTypeId,
          surface: 1200,
          heatingSystemType: "pompa_calore",
        }),
      });

      const finalCount = await AuditLog.countDocuments({ action: "create", entityType: "building" });
      expect(finalCount).toBe(initialCount + 1);
    });

    test("should create audit log on building update", async () => {
      const initialCount = await AuditLog.countDocuments({ action: "update", entityType: "building" });

      await app.request(`/api/buildings/${buildingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Updated Building Name",
        }),
      });

      const finalCount = await AuditLog.countDocuments({ action: "update", entityType: "building" });
      expect(finalCount).toBeGreaterThan(initialCount);
    });

    test("should create audit log on sensor creation", async () => {
      const initialCount = await AuditLog.countDocuments({ action: "create", entityType: "sensor" });

      await app.request("/api/sensors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          serialNumber: "SN-NEW-001",
          sensorType: "external_temp",
          location: "Esterno",
          installationDate: new Date().toISOString(),
          buildingId: buildingId,
          transmissionInterval: 300,
        }),
      });

      const finalCount = await AuditLog.countDocuments({ action: "create", entityType: "sensor" });
      expect(finalCount).toBe(initialCount + 1);
    });

    test("should track who performed the action", async () => {
      // Operator creates a building
      await app.request("/api/buildings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${operatorToken}`,
        },
        body: JSON.stringify({
          name: "Operator Building",
          address: "Via Operatore 1",
          geographicZone: "Centro",
          buildingType: buildingTypeId,
          surface: 800,
          heatingSystemType: "caldaia_gas",
        }),
      });

      // Find the audit log
      const logs = await AuditLog.find({ action: "create" })
        .sort({ timestamp: -1 })
        .limit(1);

      expect(logs[0]!.performedBy.toString()).toBe(operatorUserId);
    });
  });

  describe("Audit Log Sorting", () => {
    test("should return logs in descending order by timestamp", async () => {
      const res = await app.request("/api/audit-logs", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      // Verify timestamps are in descending order
      for (let i = 0; i < data.logs.length - 1; i++) {
        const currentTimestamp = new Date(data.logs[i].timestamp).getTime();
        const nextTimestamp = new Date(data.logs[i + 1].timestamp).getTime();
        expect(currentTimestamp).toBeGreaterThanOrEqual(nextTimestamp);
      }
    });
  });
});
