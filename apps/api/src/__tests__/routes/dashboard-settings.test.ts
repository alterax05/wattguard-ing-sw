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
import {
  describe,
  test,
  expect,
  beforeEach,
  expectTypeOf,
} from "bun:test";
import { testClient } from "hono/testing";
import mongoose from "mongoose";
import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";
import { User } from "../../models/User";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";
import { Alert } from "../../models/Alert";
import type {
  HealthResponse,
  MetricsResponse,
  MetricsHistoryResponse,
  SettingsResponse,
  ErrorResponse,
} from "@wattguard/shared";

const client = testClient(app);

let adminToken: string;

setupIntegrationTests();

beforeEach(async () => {

  const hash = await Bun.password.hash("admin123", { algorithm: "bcrypt", cost: 10 });
  await User.create({
    email: "admin@test.com",
    role: "admin",
    isDisabled: false,
    passwordHash: hash,
  });

  const loginRes = await client.api.v1.auth.session.$post({
    json: { email: "admin@test.com", password: "admin123" },
  });

  const tokenMatch = loginRes.headers.get("set-cookie")!.match(/access_token=([^;]+)/);
  if (!tokenMatch) return expect.unreachable("Admin token not found");
  adminToken = tokenMatch[1]!;
});

describe("GET /api/v1/health", () => {
  test("GET /api/health returns ok", async () => {
    const res = await client.api.v1.health.$get();

    expect(res.status).toBe(200);
    const data = await res.json();
    expectTypeOf(data).toExtend<HealthResponse>();
    expect(data.success).toBe(true);
    if (!data.success) return expect.unreachable("Expected success to be true");
    expect(data.data.status).toBe("ok");
  });
});

describe("dashboard api", () => {
  test("GET /api/dashboard/stats returns aggregated counters", async () => {
    const admin = await User.findOne({ email: "admin@test.com" });
    await Sensor.create([
      { building: "507f1f77bcf86cd799439011", sensorType: "internal_temp", location: "Piano 1", installationDate: new Date(), status: "active", transmissionInterval: 90, createdBy: admin!._id, updatedBy: admin!._id },
      { building: "507f1f77bcf86cd799439011", sensorType: "internal_temp", location: "Piano 2", installationDate: new Date(), status: "active", transmissionInterval: 90, createdBy: admin!._id, updatedBy: admin!._id },
      { building: "507f1f77bcf86cd799439011", sensorType: "external_temp", location: "Facciata", installationDate: new Date(), status: "inactive", transmissionInterval: 90, createdBy: admin!._id, updatedBy: admin!._id },
    ]);
    await Alert.create({
      building: "507f1f77bcf86cd799439011",
      type: "efficiency_below_threshold",
      severity: "medium",
      status: "active",
    });

    const res = await client.api.v1.metrics.$get(undefined, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expectTypeOf(data).toExtend<MetricsResponse | ErrorResponse>();
    expect(data.success).toBe(true);
    if (!data.success) {
      return expect.unreachable("Expected response success to be true");
    }
    expect(data.data.sensors.total).toBe(3);
    expect(data.data.sensors.active).toBe(2);
    expect(data.data.alerts.active).toBe(1);
    expect(data.data.consumption.electricity).toBeNull();
    expect(data.data.consumption.gas).toBeNull();
  });

  test("GET /api/v1/metrics/timeseries returns bucketed data", async () => {
    const now = new Date();
    const startDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = now.toISOString();

    const res = await client.api.v1.metrics.timeseries.$get(
      {
        query: { startDate, endDate, interval: "day" },
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expectTypeOf(data).toExtend<MetricsHistoryResponse | ErrorResponse>();
    expect(data.success).toBe(true);
    if (!data.success) {
      return expect.unreachable("Expected response success to be true");
    }
    expect(data.data.period.interval).toBe("day");
    expect(Array.isArray(data.data.data)).toBe(true);
  });

  test("GET /api/v1/metrics/timeseries rejects invalid date range", async () => {
    const res = await client.api.v1.metrics.timeseries.$get(
      {
        query: { startDate: "2026-01-02T00:00:00.000Z", endDate: "2026-01-01T00:00:00.000Z" },
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    expect(res.status).toBe(422);
  });
});

describe("settings api", () => {
  test("GET /api/settings returns the system config", async () => {
    const res = await client.api.v1.settings.$get(undefined, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expectTypeOf(data).toExtend<SettingsResponse | ErrorResponse>();
    expect(data.success).toBe(true);
    if (!data.success) {
      return expect.unreachable("Expected response success to be true");
    }
    expect(data.data.polling.intervalSeconds).toBeGreaterThan(0);
    expect(data.data.notifications.emailEnabled).toBeTypeOf("boolean");
    expect(data.data.database.dataRetentionDays).toBeGreaterThan(0);
  });

  test("PATCH /api/settings updates the config", async () => {
    const res = await client.api.v1.settings.$patch(
      {
        json: { polling: { intervalSeconds: 60 } },
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expectTypeOf(data).toExtend<SettingsResponse | ErrorResponse>();
    expect(data.success).toBe(true);
    if (!data.success) {
      return expect.unreachable("Expected response success to be true");
    }
    expect(data.data.polling.intervalSeconds).toBe(60);
  });

  test("GET /api/settings allows operator role", async () => {
    await User.create({
      email: "operator@test.com",
      role: "operator",
      isDisabled: false,
      passwordHash: await Bun.password.hash("operator123", { algorithm: "bcrypt", cost: 10 }),
    });

    const loginRes = await client.api.v1.auth.session.$post({
      json: { email: "operator@test.com", password: "operator123" },
    });

    const tokenMatch = loginRes.headers.get("set-cookie")!.match(/access_token=([^;]+)/);
    const operatorToken = tokenMatch![1]!;

    const res = await client.api.v1.settings.$get(undefined, {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    if (!data.success) {
      return expect.unreachable("Expected response success to be true");
    }
    expect(data.data.polling.intervalSeconds).toBeGreaterThan(0);
  });

  test("PATCH /api/settings rejects non-admin roles", async () => {
    await User.create({
      email: "operator-patch@test.com",
      role: "operator",
      isDisabled: false,
      passwordHash: await Bun.password.hash("operator123", { algorithm: "bcrypt", cost: 10 }),
    });

    const loginRes = await client.api.v1.auth.session.$post({
      json: { email: "operator-patch@test.com", password: "operator123" },
    });

    const tokenMatch = loginRes.headers.get("set-cookie")!.match(/access_token=([^;]+)/);
    const operatorToken = tokenMatch![1]!;

    const res = await client.api.v1.settings.$patch(
      {
        json: { polling: { intervalSeconds: 60 } },
      },
      {
        headers: { Authorization: `Bearer ${operatorToken}` },
      }
    );

    expect(res.status).toBe(403);
  });

  test("PATCH /api/settings updates retention and sets expireAfterSeconds via collMod", async () => {
    await SensorReading.createCollection();

    const res = await client.api.v1.settings.$patch(
      {
        json: { database: { dataRetentionDays: 30 } },
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    if (!data.success) {
      return expect.unreachable("Expected response success to be true");
    }
    expect(data.data.database.dataRetentionDays).toBe(30);

    // Verify MongoDB collection options updated
    const db = mongoose.connection.db;
    const collections = await db!.listCollections({ name: "sensorreadings" }).toArray();
    // SAFETY: collections[0] is the collection info object from MongoDB listCollections.
    const collectionInfo = collections[0] as { options?: { expireAfterSeconds?: number } } | undefined;
    expect(collectionInfo?.options?.expireAfterSeconds).toBe(30 * 86400);
  });
});
