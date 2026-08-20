import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Types } from "mongoose";
import { testClient } from "hono/testing";
import { app } from "../../index";
import { Building } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";
import { SensorReading } from "../../models/SensorReading";
import { User } from "../../models/User";
import { clearTestDB, connectTestDB, disconnectTestDB } from "../helpers/db";

const client = testClient(app);

let adminToken: string;
let operatorToken: string;
let buildingId: string;
let buildingName: string;

async function login(email: string, password: string): Promise<string> {
  const response = await client.api.v1.auth.local.login.$post({
    json: { email, password },
  });
  const cookie = response.headers.get("set-cookie");
  const token = cookie?.match(/access_token=([^;]+)/)?.[1];

  if (!token) throw new Error(`Token not found for ${email}`);
  return token;
}

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();

  const passwordHash = await Bun.password.hash("admin123", {
    algorithm: "bcrypt",
    cost: 10,
  });
  const admin = await User.create({
    email: "export-admin@test.com",
    role: "admin",
    passwordHash,
  });
  await User.create({
    email: "export-operator@test.com",
    role: "operator",
    passwordHash,
  });

  adminToken = await login("export-admin@test.com", "admin123");
  operatorToken = await login("export-operator@test.com", "admin123");

  const buildingType = await BuildingType.create({ name: "Export test type" });
  buildingName = 'Edificio "Centro", Milano';
  const building = await Building.create({
    name: buildingName,
    address: "Via Export 1",
    surface: 1000,
    ceilingHeight: 3,
    location: { type: "Point", coordinates: [11.1167, 46.0667] },
    buildingType: buildingType._id,
    heatingSystemType: "caldaia_gas",
    geographicZone: "Centro",
    createdBy: admin._id,
    updatedBy: admin._id,
  });
  buildingId = building._id.toString();

  await SensorReading.create([
    {
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
      value: 20.5,
      unit: "°C",
      metadata: {
        sensorId: new Types.ObjectId(),
        buildingId: building._id,
        sensorType: "internal_temp",
      },
    },
    {
      timestamp: new Date("2026-01-15T12:00:00.000Z"),
      value: 5.25,
      unit: "kWh",
      metadata: {
        sensorId: new Types.ObjectId(),
        buildingId: building._id,
        sensorType: "energy_meter",
      },
    },
    {
      timestamp: new Date("2026-01-31T23:59:59.999Z"),
      value: 3.1,
      unit: "m³",
      metadata: {
        sensorId: new Types.ObjectId(),
        buildingId: building._id,
        sensorType: "gas_meter",
      },
    },
    {
      timestamp: new Date("2026-02-01T00:00:00.000Z"),
      value: 99,
      unit: "kWh",
      metadata: {
        sensorId: new Types.ObjectId(),
        buildingId: building._id,
        sensorType: "energy_meter",
      },
    },
  ]);
});

describe("Consumption export API", () => {
  test("requires authentication", async () => {
    const response = await client.api.v1.export.consumption.$get({
      query: {
        buildingIds: buildingId,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    });

    expect(response.status).toBe(401);
  });

  test("allows only administrators", async () => {
    const response = await client.api.v1.export.consumption.$get(
      {
        query: {
          buildingIds: buildingId,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
        },
      },
      { headers: { Cookie: `access_token=${operatorToken}` } },
    );

    expect(response.status).toBe(403);
  });

  test("rejects missing and reversed date ranges", async () => {
    const missingDateResponse = await client.api.v1.export.consumption.$get(
      {
        // @ts-expect-error intentionally missing date range
        query: {
          buildingIds: buildingId,
        },
      },
      { headers: { Cookie: `access_token=${adminToken}` } },
    );
    expect(missingDateResponse.status).toBe(400);

    const reversedDateResponse = await client.api.v1.export.consumption.$get(
      {
        query: {
          buildingIds: buildingId,
          startDate: "2026-02-01",
          endDate: "2026-01-01",
        },
      },
      { headers: { Cookie: `access_token=${adminToken}` } },
    );
    expect(reversedDateResponse.status).toBe(400);
  });

  test("returns selected readings in the requested period as CSV", async () => {
    const response = await client.api.v1.export.consumption.$get(
      {
        query: {
          buildingIds: buildingId,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
        },
      },
      { headers: { Cookie: `access_token=${adminToken}` } },
    );
    const csv = await response.text();
    const rows = csv.trimEnd().split("\r\n");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain(
      "wattguard-consumption-2026-01-01-2026-01-31.csv",
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]).toBe(
      "timestamp,buildingId,buildingName,sensorId,sensorType,value,unit",
    );
    expect(csv).toContain("internal_temp");
    expect(csv).toContain("energy_meter");
    expect(csv).toContain("gas_meter");
    expect(csv).toContain('"Edificio ""Centro"", Milano"');
    expect(csv).not.toContain("2026-02-01T00:00:00.000Z");
  });

  test("returns 404 when a selected building does not exist", async () => {
    const response = await client.api.v1.export.consumption.$get(
      {
        query: {
          buildingIds: new Types.ObjectId().toString(),
          startDate: "2026-01-01",
          endDate: "2026-01-31",
        },
      },
      { headers: { Cookie: `access_token=${adminToken}` } },
    );

    expect(response.status).toBe(404);
  });
});
