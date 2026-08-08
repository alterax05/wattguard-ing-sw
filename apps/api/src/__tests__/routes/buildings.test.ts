import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import mongoose from "mongoose";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";
import { Alert } from "../../models/Alert";

// Suppress console logs during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

let adminToken: string;
let operatorToken: string;
let adminUserId: mongoose.Types.ObjectId;
let buildingTypeId: mongoose.Types.ObjectId;

beforeAll(async () => {
  console.log = () => {};
  console.error = () => {};
  await connectTestDB();
});

afterAll(async () => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();

  // Create test users (admin and operator)
  const adminPasswordHash = await Bun.password.hash("admin123", {
    algorithm: "bcrypt",
    cost: 10,
  });

  const admin = await User.create({
    email: "admin@test.com",
    role: "admin",
    passwordHash: adminPasswordHash,
  });
  adminUserId = admin._id as mongoose.Types.ObjectId;

  const operatorPasswordHash = await Bun.password.hash("operator123", {
    algorithm: "bcrypt",
    cost: 10,
  });

  await User.create({
    email: "operator@test.com",
    role: "operator",
    passwordHash: operatorPasswordHash,
  });

  // Login to get tokens
  const adminLoginRes = await app.request("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@test.com",
      password: "admin123",
    }),
  });
  
  const adminCookie = adminLoginRes.headers.get("set-cookie");
  const adminTokenMatch = adminCookie?.match(/access_token=([^;]+)/);
  if (!adminTokenMatch) throw new Error("Admin token not found");
  adminToken = adminTokenMatch[1] as string;
  
  console.log("Admin login status:", adminLoginRes.status);
  console.log("Admin token:", adminToken ? "exists" : "missing");

  const operatorLoginRes = await app.request("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "operator@test.com",
      password: "operator123",
    }),
  });
  
  const operatorCookie = operatorLoginRes.headers.get("set-cookie");
  const operatorTokenMatch = operatorCookie?.match(/access_token=([^;]+)/);
  if (!operatorTokenMatch) throw new Error("Operator token not found");
  operatorToken = operatorTokenMatch[1] as string;

  // Create a test building type
  const buildingType = await BuildingType.create({
    name: "Scuola",
    description: "Edificio scolastico",
  });
  buildingTypeId = buildingType._id as mongoose.Types.ObjectId;
});

describe("Buildings Routes - Integration Tests", () => {
  describe("Create Building (POST /api/buildings)", () => {
    test("should create a new building with valid data (admin)", async () => {
      const buildingData = {
        name: "Scuola Primaria Test",
        address: "Via Test 123, Milano",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 2500,
        constructionYear: 1985,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
      };

      const res = await app.request("/api/buildings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify(buildingData),
      });

      if (res.status !== 201) {
        const errorText = await res.text();
        console.error("Create building failed:", res.status, errorText);
      }
      
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.building.name).toBe(buildingData.name);
      expect(json.building.address).toBe(buildingData.address);
      expect(json.building.status).toBe("active"); // Default value

      // Verify building was created in DB
      const building = await Building.findById(json.building.id);
      expect(building).toBeDefined();
      expect(building!.name).toBe(buildingData.name);

      
    });

    test("should create building with operator role", async () => {
      const buildingData = {
        name: "Biblioteca Test",
        address: "Via Test 456, Milano",
        geographicZone: "Nord",
        buildingType: buildingTypeId,
        surface: 1500,
        constructionYear: 2010,
        heatingSystemType: "pompa_calore",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
      };

      const res = await app.request("/api/buildings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${operatorToken}`,
        },
        body: JSON.stringify(buildingData),
      });

      expect(res.status).toBe(201);
    });

    test("should reject invalid data", async () => {
      const invalidData = {
        name: "", // Empty name
        address: "Via Test",
        surface: -100, // Negative surface
      };

      const res = await app.request("/api/buildings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify(invalidData),
      });

      expect(res.status).toBe(400);
    });

    test("should reject invalid building type ID", async () => {
      const buildingData = {
        name: "Test Building",
        address: "Via Test 123",
        geographicZone: "Centro",
        buildingType: "invalid-id",
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      };

      const res = await app.request("/api/buildings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify(buildingData),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Update Building (PATCH /api/buildings/:id)", () => {
    test("should update building", async () => {
      // Create a building first
      const building = await Building.create({
        name: "Original Name",
        address: "Via Original",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const updateData = {
        name: "Updated Name",
        surface: 1500,
        status: "inactive",
      };

      const res = await app.request(`/api/buildings/${building._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify(updateData),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.building.name).toBe("Updated Name");
      expect(json.building.surface).toBe(1500);
      expect(json.building.status).toBe("inactive");

      
    });

    test("should return 404 for non-existent building", async () => {
      const fakeId = "507f1f77bcf86cd799439011"; // Valid ObjectId format

      const res = await app.request(`/api/buildings/${fakeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ name: "New Name" }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("Delete Building (DELETE /api/buildings/:id)", () => {
    test("should delete building with cascade delete of sensors and readings", async () => {
      // Create building with sensors and readings
      const building = await Building.create({
        name: "Building to Delete",
        address: "Via Delete 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const sensor = await Sensor.create({
        buildingId: building._id,
        sensorType: "internal_temp",
        location: "Piano 1",
        status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      await SensorReading.create({
        timestamp: new Date(),
        value: 22.5,
        unit: "°C",
        metadata: {
          sensorId: sensor._id,
          buildingId: building._id,
          sensorType: "internal_temp",
        },
      });

      await Alert.create({
        buildingId: building._id,
        buildingName: building.name,
        sensorId: sensor._id,
        type: "threshold_exceeded",
        thresholdType: "max",
        severity: "high",
        message: "Temperature too high",
        status: "active",
      });

      const res = await app.request(`/api/buildings/${building._id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify building deleted
      const deletedBuilding = await Building.findById(building._id);
      expect(deletedBuilding).toBeNull();

      // Verify sensors deleted
      const deletedSensor = await Sensor.findById(sensor._id);
      expect(deletedSensor).toBeNull();

      // Verify readings deleted
      const readings = await SensorReading.find({ "metadata.buildingId": building._id });
      expect(readings.length).toBe(0);

      const alerts = await Alert.countDocuments({ buildingId: building._id });
      expect(alerts).toBe(0);

      
    });
  });
  
  describe("Search Buildings (GET /api/buildings)", () => {
    beforeEach(async () => {
      // Create multiple buildings for search testing
      const buildings = [
        {
          name: "Scuola Primaria Centro",
          address: "Via Roma 10, Milano",
          geographicZone: "Centro",
          buildingType: buildingTypeId,
          surface: 2500,
          constructionYear: 1985,
          heatingSystemType: "caldaia_gas",
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          createdBy: adminUserId,
          updatedBy: adminUserId,
          status: "active",
        },
        {
          name: "Scuola Secondaria Nord",
          address: "Via Garibaldi 20, Milano",
          geographicZone: "Nord",
          buildingType: buildingTypeId,
          surface: 3000,
          constructionYear: 1995,
          heatingSystemType: "teleriscaldamento",
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          createdBy: adminUserId,
          updatedBy: adminUserId,
          status: "active",
        },
        {
          name: "Biblioteca Sud",
          address: "Via Dante 30, Milano",
          geographicZone: "Sud",
          buildingType: buildingTypeId,
          surface: 1500,
          constructionYear: 2010,
          heatingSystemType: "pompa_calore",
          location: { type: "Point", coordinates: [11.1167, 46.0667] },
          createdBy: adminUserId,
          updatedBy: adminUserId,
          status: "inactive",
        },
      ];
      await Building.insertMany(buildings);
    });

    test("should search by name", async () => {
      const res = await app.request("/api/buildings?name=Scuola", {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildings.length).toBe(2);
      expect(json.buildings[0].name).toContain("Scuola");
    });

    test("should search by address", async () => {
      const res = await app.request("/api/buildings?address=Garibaldi", {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildings.length).toBe(1);
      expect(json.buildings[0].address).toContain("Garibaldi");
    });

    test("should filter by zone", async () => {
      const res = await app.request("/api/buildings?zone=Centro", {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildings.length).toBe(1);
      expect(json.buildings[0].geographicZone).toBe("Centro");
    });

    test("should filter by building type", async () => {
      const res = await app.request(`/api/buildings?buildingType=${buildingTypeId}`, {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildings.length).toBe(3); // All test buildings have same type
    });

    test("should filter by status", async () => {
      const res = await app.request("/api/buildings?status=inactive", {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildings.length).toBe(1);
      expect(json.buildings[0].status).toBe("inactive");
    });

    test("should combine multiple filters", async () => {
      const res = await app.request("/api/buildings?zone=Centro&status=active&name=Scuola", {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildings.length).toBe(1);
      expect(json.buildings[0].name).toBe("Scuola Primaria Centro");
    });

    test("should support pagination", async () => {
      const res = await app.request("/api/buildings?limit=2&offset=0", {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildings.length).toBe(2);
      expect(json.pagination.total).toBe(3);
      expect(json.pagination.limit).toBe(2);
      expect(json.pagination.offset).toBe(0);
    });

    test("should support sorting", async () => {
      const res = await app.request("/api/buildings?sortBy=name&sortOrder=asc", {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.buildings.length).toBeGreaterThan(0);
      // Verify ascending order
      for (let i = 1; i < json.buildings.length; i++) {
        expect(json.buildings[i].name >= json.buildings[i-1].name).toBe(true);
      }
    });

    test("should return all required details in search results", async () => {
      const res = await app.request("/api/buildings", {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      const building = json.buildings[0];
      
      expect(building.name).toBeDefined();
      expect(building.address).toBeDefined();
      expect(building.surface).toBeDefined();
      expect(building.heatingSystemType).toBeDefined();
      expect(building.status).toBeDefined();
      expect(building.updatedAt).toBeDefined();
    });
  });

  describe("Get Building Details (GET /api/buildings/:id)", () => {
    test("should return complete building details", async () => {
      const building = await Building.create({
        name: "Test Building Details",
        address: "Via Details 1, Milano",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 2000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const res = await app.request(`/api/buildings/${building._id}`, {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      
      expect(json.building.name).toBe("Test Building Details");
      expect(json.building.address).toBe("Via Details 1, Milano");
      expect(json.building.surface).toBe(2000);
      expect(json.building.constructionYear).toBe(2000);
      expect(json.building.buildingType).toBeDefined();
    });
  });

  describe("Get Real-time Data (GET /api/buildings/:id/real-time)", () => {
    test("should return real-time data for all sensor types", async () => {
      const building = await Building.create({
        name: "Building Real-time",
        address: "Via Real-time 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const now = new Date();

      await Sensor.create([
        {
          buildingId: building._id,
          sensorType: "internal_temp",
          location: "Piano 1",
          status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
          lastReading: { value: 22.5, unit: "°C", timestamp: now },
        },
        {
          buildingId: building._id,
          sensorType: "external_temp",
          location: "Facciata",
          status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
          lastReading: { value: 10.2, unit: "°C", timestamp: now },
        },
        {
          buildingId: building._id,
          sensorType: "energy_meter",
          location: "Locale tecnico",
          status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
          lastReading: { value: 150.5, unit: "kW", timestamp: now },
        },
      ]);

      const res = await app.request(`/api/buildings/${building._id}/real-time`, {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      
      expect(json.data).toBeDefined();
      expect(json.data.internalTemperature).toBeDefined();
      expect(json.data.internalTemperature.value).toBe(22.5);
      expect(json.data.internalTemperature.unit).toBe("°C");
      
      expect(json.data.externalTemperature).toBeDefined();
      expect(json.data.externalTemperature.value).toBe(10.2);
      
      expect(json.data.energyConsumption).toBeDefined();
      expect(json.data.energyConsumption.value).toBe(150.5);
      expect(json.data.energyConsumption.unit).toBe("kW");
    });

    test("should handle missing sensors gracefully", async () => {
      const building = await Building.create({
        name: "Building Partial Sensors",
        address: "Via Partial 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      // Only create one sensor
      await Sensor.create({
        buildingId: building._id,
        sensorType: "internal_temp",
        location: "Piano 1",
        status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
        lastReading: { value: 22.5, unit: "°C", timestamp: new Date() },
      });

      const res = await app.request(`/api/buildings/${building._id}/real-time`, {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.internalTemperature.value).toBe(22.5);
      expect(json.data.externalTemperature.value).toBeNull();
      expect(json.data.energyConsumption.value).toBeNull();
    });
  });

  describe("Get Historical Data (GET /api/buildings/:id/history)", () => {
    test("should return historical data with time aggregation", async () => {
      const building = await Building.create({
        name: "Building History",
        address: "Via History 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const sensor = await Sensor.create({
        buildingId: building._id,
        sensorType: "internal_temp",
        location: "Piano 1",
        status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      // Create readings for the last 24 hours
      const now = new Date();
      const readings = [];
      for (let i = 0; i < 24; i++) {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000); // Every hour
        readings.push({
          timestamp,
          value: 20 + Math.random() * 4, // 20-24°C
          unit: "°C",
          metadata: {
            sensorId: sensor._id,
            buildingId: building._id,
            sensorType: "internal_temp",
          },
        });
      }
      await SensorReading.insertMany(readings);

      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const endDate = now.toISOString();

      const res = await app.request(
        `/api/buildings/${building._id}/history?startDate=${startDate}&endDate=${endDate}&sensorType=internal_temp&interval=hour`,
        {
          headers: { "Authorization": `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      
      expect(json.data).toBeDefined();
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.buildingId).toBe(building._id.toString());
      expect(json.buildingName).toBe(building.name);
      
      // Verify data structure
      const dataPoint = json.data[0];
      expect(dataPoint.timestamp).toBeDefined();
      expect(dataPoint.value).toBeDefined();
      expect(dataPoint.sensorType).toBe("internal_temp");
    });

    test("should filter by date range", async () => {
      const building = await Building.create({
        name: "Building Date Filter",
        address: "Via Date 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const sensor = await Sensor.create({
        buildingId: building._id,
        sensorType: "energy_meter",
        location: "Locale tecnico",
        status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      await SensorReading.insertMany([
        {
          timestamp: twoDaysAgo,
          value: 100,
          unit: "kW",
          metadata: { sensorId: sensor._id, buildingId: building._id, sensorType: "energy_meter" },
        },
        {
          timestamp: oneDayAgo,
          value: 150,
          unit: "kW",
          metadata: { sensorId: sensor._id, buildingId: building._id, sensorType: "energy_meter" },
        },
        {
          timestamp: now,
          value: 200,
          unit: "kW",
          metadata: { sensorId: sensor._id, buildingId: building._id, sensorType: "energy_meter" },
        },
      ]);

      // Query only last 24 hours
      const startDate = oneDayAgo.toISOString();
      const endDate = now.toISOString();

      const res = await app.request(
        `/api/buildings/${building._id}/history?startDate=${startDate}&endDate=${endDate}&sensorType=energy_meter`,
        {
          headers: { "Authorization": `Bearer ${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      
      // Should only include readings from the last 24 hours
      expect(json.data.length).toBeGreaterThan(0);
      json.data.forEach((point: { timestamp: string }) => {
        const timestamp = new Date(point.timestamp);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(oneDayAgo.getTime());
      });
    });

    test("should support different interval types", async () => {
      const building = await Building.create({
        name: "Building Intervals",
        address: "Via Intervals 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const sensor = await Sensor.create({
        buildingId: building._id,
        sensorType: "internal_temp",
        location: "Piano 1",
        status: "active",
        installationDate: new Date(),
        transmissionInterval: 90,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      const now = new Date();
      const readings = [];
      for (let i = 0; i < 100; i++) {
        readings.push({
          timestamp: new Date(now.getTime() - i * 5 * 60 * 1000), // Every 5 minutes
          value: 22,
          unit: "°C",
          metadata: { sensorId: sensor._id, buildingId: building._id, sensorType: "internal_temp" },
        });
      }
      await SensorReading.insertMany(readings);

      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const endDate = now.toISOString();

      // Test different intervals (currently not implemented in aggregation, just verify data is returned)
      const intervals = ["minute", "hour", "day"];
      
      for (const interval of intervals) {
        const res = await app.request(
          `/api/buildings/${building._id}/history?startDate=${startDate}&endDate=${endDate}&sensorType=internal_temp&interval=${interval}`,
          {
            headers: { "Authorization": `Bearer ${adminToken}` },
          }
        );

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.length).toBeGreaterThan(0);
        expect(json.buildingId).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Authorization Tests
  // ============================================================================

  describe("Authorization", () => {
    test("should deny access without token", async () => {
      const res = await app.request("/api/buildings", {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });

    test("should deny access with invalid token", async () => {
      const res = await app.request("/api/buildings", {
        method: "GET",
        headers: {
          "Authorization": "Bearer invalid-token",
        },
      });

      expect(res.status).toBe(401);
    });

    test("should allow both admin and operator to read buildings", async () => {
      const building = await Building.create({
        name: "Test Auth",
        address: "Via Auth 1",
        geographicZone: "Centro",
        buildingType: buildingTypeId,
        surface: 1000,
        constructionYear: 2000,
        heatingSystemType: "caldaia_gas",
        location: { type: "Point", coordinates: [11.1167, 46.0667] },
        createdBy: adminUserId,
        updatedBy: adminUserId,
      });

      // Admin should have access
      const adminRes = await app.request(`/api/buildings/${building._id}`, {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });
      expect(adminRes.status).toBe(200);

      // Operator should also have access
      const operatorRes = await app.request(`/api/buildings/${building._id}`, {
        headers: { "Authorization": `Bearer ${operatorToken}` },
      });
      expect(operatorRes.status).toBe(200);
    });
  });
});
