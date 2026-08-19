import { describe, expect, it, beforeAll, afterAll, beforeEach, expectTypeOf } from "bun:test";
import { testClient } from "hono/testing";
import { z } from "zod";
import { app } from "../../index";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../helpers/db";
import { ErrorSchema } from "@wattguard/shared";
import type { ListAlertsResponse, UpdateAlertStatusResponse } from "@wattguard/shared";

type ErrorResponse = z.infer<typeof ErrorSchema>;

const client = testClient(app);
import { Alert } from "../../models/Alert";
import { User } from "../../models/User";
import { Building } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";

let adminToken: string;

let buildingId: string;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();

  // Create an admin user with a password to login properly
  const adminPasswordHash = await Bun.password.hash("admin123", {
    algorithm: "bcrypt",
    cost: 10,
  });

  const admin = await User.create({
    email: "admin-alerts@test.com",
    name: "Admin User",
    role: "admin",
    passwordHash: adminPasswordHash,
    isDisabled: false,
  });
  

  // Generate token through login route
  const loginRes = await app.request("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin-alerts@test.com",
      password: "admin123",
    }),
  });

  const cookie = loginRes.headers.get("set-cookie");
  const tokenMatch = cookie?.match(/access_token=([^;]+)/);
  if (!tokenMatch) throw new Error("Admin token not found, response status: " + loginRes.status);
  adminToken = tokenMatch[1] as string;

  // Create building type and building
  const type = await BuildingType.create({ name: "Test Type" });
  const building = await Building.create({
    name: "Test Building",
    address: "123 Test St",
    surface: 100,
    ceilingHeight: 3,
    location: { type: "Point", coordinates: [11.12, 46.07] },
    buildingType: type._id,
    heatingSystemType: "Heat Pump",
    geographicZone: "E",
    status: "active",
    createdBy: admin._id,
    updatedBy: admin._id,
  });
  buildingId = building._id.toString();

  // Seed some alerts
  await Alert.create([
    {
      buildingId,
      buildingName: "Test Building",
      type: "temperature_anomaly",
      severity: "critical",
      sensorType: "internal_temp",
      location: "Sala Principale",
      value: 31.5,
      unit: "°C",
      limit: 30,
      status: "active",
    },
    {
      buildingId,
      buildingName: "Test Building",
      type: "sensor_offline",
      severity: "medium",
      sensorType: "energy_meter",
      location: "Quadro Elettrico",
      status: "acknowledged",
      acknowledgedBy: "Test User",
      acknowledgedAt: new Date(),
    },
  ]);
});

describe("Alerts API", () => {
  it("should list alerts", async () => {
    const res = await client.api.v1.alerts.$get(
      { query: {} },
      {
        headers: { Cookie: `access_token=${adminToken}` },
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expectTypeOf(body).toExtend<ListAlertsResponse | ErrorResponse>();
    if (!("alerts" in body)) {
      throw new Error("Expected response to contain 'alerts'");
    }
    expect(body.alerts).toBeInstanceOf(Array);
    expect(body.alerts.length).toBe(2);
    const thresholdAlert = body.alerts.find(
      (alert) => alert.type === "temperature_anomaly",
    );
    expect(thresholdAlert).toBeDefined();
    expect(thresholdAlert!.sensorType).toBe("internal_temp");
    expect(thresholdAlert!.location).toBe("Sala Principale");
    expect(thresholdAlert!.value).toBe(31.5);
    expect(thresholdAlert!.unit).toBe("°C");
    expect(thresholdAlert!.limit).toBe(30);
    expect(thresholdAlert).not.toHaveProperty("message");
  });

  it("should acknowledge an active alert", async () => {
    const alert = await Alert.findOne({ status: "active" });
    expect(alert).toBeDefined();

    const res = await client.api.v1.alerts[":id"].acknowledge.$patch(
      {
        param: { id: alert!._id.toString() },
      },
      {
        headers: { Cookie: `access_token=${adminToken}` },
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expectTypeOf(body).toExtend<UpdateAlertStatusResponse | ErrorResponse>();
    if (!("alert" in body)) {
      throw new Error("Expected response to contain 'alert'");
    }
    expect(body.success).toBe(true);
    expect(body.alert.status).toBe("acknowledged");
    expect(body.alert.acknowledgedBy).toBe("Admin User");
  });

  it("should fail to acknowledge an already acknowledged alert", async () => {
    const alert = await Alert.findOne({ status: "acknowledged" });
    expect(alert).toBeDefined();

    const res = await client.api.v1.alerts[":id"].acknowledge.$patch(
      {
        param: { id: alert!._id.toString() },
      },
      {
        headers: { Cookie: `access_token=${adminToken}` },
      }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    if (!("error" in body)) {
      throw new Error("Expected response to contain 'error'");
    }
    expect(body.error).toBe("Only active alerts can be acknowledged");
    expect((body as { error: string; code?: string }).code).toBe("alert_not_active");
  });

  it("should resolve an alert", async () => {
    const alert = await Alert.findOne({ status: "acknowledged" });
    expect(alert).toBeDefined();

    const res = await client.api.v1.alerts[":id"].resolve.$patch(
      {
        param: { id: alert!._id.toString() },
      },
      {
        headers: { Cookie: `access_token=${adminToken}` },
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expectTypeOf(body).toExtend<UpdateAlertStatusResponse | ErrorResponse>();
    if (!("alert" in body)) {
      throw new Error("Expected response to contain 'alert'");
    }
    expect(body.success).toBe(true);
    expect(body.alert.status).toBe("resolved");
    expect(body.alert.resolvedBy).toBe("Admin User");
  });
});
