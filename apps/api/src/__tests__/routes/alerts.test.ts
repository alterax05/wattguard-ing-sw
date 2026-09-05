import {
  describe,
  expect,
  it,
  beforeEach,
  expectTypeOf,
} from "bun:test";
import { testClient } from "hono/testing";
import { z } from "zod";
import { app } from "../../index";
import { setupIntegrationTests } from "../helpers/db";
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

setupIntegrationTests();

beforeEach(async () => {

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
  const loginRes = await client.api.v1.auth.local.login.$post({
    json: {
      email: "admin-alerts@test.com",
      password: "admin123",
    },
  });

  const cookie = loginRes.headers.get("set-cookie");
  const tokenMatch = cookie?.match(/access_token=([^;]+)/);
  if (!tokenMatch) throw new Error("Admin token not found, response status: " + loginRes.status);
  // SAFETY: the access_token regex has a capture group, so group 1 is present once the match succeeds.
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
      type: "threshold_exceeded",
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
      type: "efficiency_below_threshold",
      severity: "medium",
      sensorType: "energy_meter",
      location: "Quadro Elettrico",
      status: "acknowledged",
      acknowledgedBy: "Test User",
      acknowledgedAt: new Date(),
    },
  ]);
});

describe("alerts api", () => {
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
    expect(body.success).toBe(true);
    if (!body.success) {
      throw new Error("Expected response success to be true");
    }
    expect(body.data.alerts).toBeInstanceOf(Array);
    expect(body.data.alerts.length).toBe(2);
    const thresholdAlert = body.data.alerts.find(
      (alert) => alert.type === "threshold_exceeded",
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

    const res = await client.api.v1.alerts[":id"].$patch(
      {
        param: { id: alert!._id.toString() },
        json: { status: "acknowledged" },
      },
      {
        headers: { Cookie: `access_token=${adminToken}` },
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expectTypeOf(body).toExtend<UpdateAlertStatusResponse | ErrorResponse>();
    expect(body.success).toBe(true);
    if (!body.success) {
      throw new Error("Expected response success to be true");
    }
    expect(body.data.status).toBe("acknowledged");
    expect(body.data.acknowledgedBy).toBe("Admin User");
  });

  it("should fail to acknowledge an already acknowledged alert", async () => {
    const alert = await Alert.findOne({ status: "acknowledged" });
    expect(alert).toBeDefined();

    const res = await client.api.v1.alerts[":id"].$patch(
      {
        param: { id: alert!._id.toString() },
        json: { status: "acknowledged" },
      },
      {
        headers: { Cookie: `access_token=${adminToken}` },
      }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    if (body.success) {
      throw new Error("Expected response success to be false");
    }
    expect(body.message).toBe("Only active alerts can be acknowledged");
    expect(body.error_code).toBe("alert_not_active");
  });

  it("should resolve an alert", async () => {
    const alert = await Alert.findOne({ status: "acknowledged" });
    expect(alert).toBeDefined();

    const res = await client.api.v1.alerts[":id"].$patch(
      {
        param: { id: alert!._id.toString() },
        json: { status: "resolved" },
      },
      {
        headers: { Cookie: `access_token=${adminToken}` },
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expectTypeOf(body).toExtend<UpdateAlertStatusResponse | ErrorResponse>();
    expect(body.success).toBe(true);
    if (!body.success) {
      throw new Error("Expected response success to be true");
    }
    expect(body.data.status).toBe("resolved");
    expect(body.data.resolvedBy).toBe("Admin User");
  });

});
