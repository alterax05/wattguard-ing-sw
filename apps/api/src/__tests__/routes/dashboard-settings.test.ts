/**
 * Integration tests for dashboard, settings and health endpoints.
 *
 * Covers endpoints without dedicated test files:
 *  - GET  /api/health
 *  - GET  /api/dashboard/stats
 *  - GET  /api/dashboard/history
 *  - GET  /api/settings
 *  - PATCH /api/settings
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, expectTypeOf } from "bun:test";
import { testClient } from "hono/testing";
import { z } from "zod";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { User } from "../../models/User";
import { Sensor } from "../../models/Sensor";
import { Alert } from "../../models/Alert";
import { ErrorSchema } from "@wattguard/shared";
import type {
  HealthResponse,
  DashboardStatsResponse,
  DashboardHistoryResponse,
  GetSettingsResponse,
  UpdateSettingsResponse,
} from "@wattguard/shared";

type ErrorResponse = z.infer<typeof ErrorSchema>;

const client = testClient(app);

let adminToken: string;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();

  const hash = await Bun.password.hash("admin123", { algorithm: "bcrypt", cost: 10 });
  await User.create({
    email: "admin@test.com",
    role: "admin",
    isDisabled: false,
    passwordHash: hash,
  });

  const loginRes = await app.request("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@test.com", password: "admin123" }),
  });

  const tokenMatch = loginRes.headers.get("set-cookie")!.match(/access_token=([^;]+)/);
  if (!tokenMatch) throw new Error("Admin token not found");
  adminToken = tokenMatch[1]!;
});

describe("Health", () => {
  test("GET /api/health returns ok", async () => {
    const res = await client.api.health.$get();

    expect(res.status).toBe(200);
    const data = await res.json();
    expectTypeOf(data).toExtend<HealthResponse>();
    expect(data.status).toBe("ok");
  });
});

describe("Dashboard", () => {
  test("GET /api/dashboard/stats returns aggregated counters", async () => {
    const admin = await User.findOne({ email: "admin@test.com" });
    await Sensor.create([
      { buildingId: "507f1f77bcf86cd799439011", sensorType: "internal_temp", location: "Piano 1", installationDate: new Date(), status: "active", transmissionInterval: 90, createdBy: admin!._id, updatedBy: admin!._id },
      { buildingId: "507f1f77bcf86cd799439011", sensorType: "internal_temp", location: "Piano 2", installationDate: new Date(), status: "active", transmissionInterval: 90, createdBy: admin!._id, updatedBy: admin!._id },
      { buildingId: "507f1f77bcf86cd799439011", sensorType: "external_temp", location: "Facciata", installationDate: new Date(), status: "inactive", transmissionInterval: 90, createdBy: admin!._id, updatedBy: admin!._id },
    ]);
    await Alert.create({
      buildingId: "507f1f77bcf86cd799439011",
      buildingName: "Test",
      type: "sensor_offline",
      severity: "medium",
      message: "Offline",
      status: "active",
    });

    const res = await client.api.dashboard.stats.$get(undefined, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expectTypeOf(data).toExtend<DashboardStatsResponse | ErrorResponse>();
    if ("sensors" in data) {
      expect(data.sensors.total).toBe(3);
      expect(data.sensors.active).toBe(2);
      expect(data.alerts.active).toBe(1);
      expect(data.consumption.electricity).toBeNull();
      expect(data.consumption.gas).toBeNull();
    }
  });

  test("GET /api/dashboard/history returns bucketed data", async () => {
    const now = new Date();
    const startDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = now.toISOString();

    const res = await client.api.dashboard.history.$get(
      {
        query: { startDate, endDate, interval: "day" },
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expectTypeOf(data).toExtend<DashboardHistoryResponse | ErrorResponse>();
    if ("period" in data) {
      expect(data.period.interval).toBe("day");
      expect(Array.isArray(data.data)).toBe(true);
    }
  });

  test("GET /api/dashboard/history rejects invalid date range", async () => {
    const res = await client.api.dashboard.history.$get(
      {
        query: { startDate: "2026-01-02T00:00:00.000Z", endDate: "2026-01-01T00:00:00.000Z" },
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    expect(res.status).toBe(400);
  });
});

describe("Settings", () => {
  test("GET /api/settings returns the system config", async () => {
    const res = await client.api.settings.$get(undefined, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expectTypeOf(data).toExtend<GetSettingsResponse | ErrorResponse>();
    if ("config" in data) {
      expect(data.config.polling.intervalSeconds).toBeGreaterThan(0);
      expect(data.config.notifications.emailEnabled).toBeTypeOf("boolean");
      expect(data.config.database.dataRetentionDays).toBeGreaterThan(0);
    }
  });

  test("PATCH /api/settings updates the config", async () => {
    const res = await client.api.settings.$patch(
      {
        json: { polling: { intervalSeconds: 60 } },
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expectTypeOf(data).toExtend<UpdateSettingsResponse | ErrorResponse>();
    if ("config" in data) {
      expect(data.success).toBe(true);
      expect(data.config.polling.intervalSeconds).toBe(60);
    }
  });

  test("GET /api/settings rejects non-admin roles", async () => {
    await User.create({
      email: "operator@test.com",
      role: "operator",
      isDisabled: false,
      passwordHash: await Bun.password.hash("operator123", { algorithm: "bcrypt", cost: 10 }),
    });

    const loginRes = await app.request("/api/auth/local/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "operator@test.com", password: "operator123" }),
    });

    const tokenMatch = loginRes.headers.get("set-cookie")!.match(/access_token=([^;]+)/);
    const operatorToken = tokenMatch![1]!;

    const res = await client.api.settings.$get(undefined, {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });

    expect(res.status as number).toBe(403);
  });
});
