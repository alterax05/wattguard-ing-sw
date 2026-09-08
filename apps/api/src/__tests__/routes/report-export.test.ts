import { beforeEach, describe, expect, test } from "bun:test";
import { Types } from "mongoose";
import ExcelJS from "exceljs";
import { testClient } from "hono/testing";
import { app } from "../../index";
import { Building } from "../../models/Building";
import { BuildingType } from "../../models/BuildingType";
import { SensorReading } from "../../models/SensorReading";
import { Alert } from "../../models/Alert";
import { User } from "../../models/User";
import { setupIntegrationTests } from "../helpers/db";

const client = testClient(app);

let adminToken: string;
let buildingId: string;

async function login(email: string, password: string): Promise<string> {
  const response = await client.api.v1.auth.session.$post({
    json: { email, password },
  });
  // SAFETY: login with valid credentials returns SessionResponse.
  const token = ((await response.json()) as { data: { token: string } }).data.token;

  if (!token) return expect.unreachable(`Token not found for ${email}`);
  return token;
}

setupIntegrationTests();

beforeEach(async () => {

  const passwordHash = await Bun.password.hash("admin123", {
    algorithm: "bcrypt",
    cost: 10,
  });
  const admin = await User.create({
    email: "report-admin@test.com",
    role: "admin",
    passwordHash,
  });
  await User.create({
    email: "report-operator@test.com",
    role: "operator",
    passwordHash,
  });

  adminToken = await login("report-admin@test.com", "admin123");

  const buildingType = await BuildingType.create({ name: "Report test type" });
  const building = await Building.create({
    name: "Edificio Report",
    address: "Via Report 1",
    surface: 800,
    ceilingHeight: 3,
    location: { type: "Point", coordinates: [11.1167, 46.0667] },
    buildingType: buildingType._id,
    heatingSystemType: "pompa_di_calore",
    geographicZone: "Centro",
    createdBy: admin._id,
    updatedBy: admin._id,
  });
  buildingId = building._id.toString();

  // Two energy_meter readings of 2 kW one day apart → 48 kWh total, 48 kWh/day.
  await SensorReading.create([
    {
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
      value: 2,
      unit: "kW",
      metadata: {
        sensor: new Types.ObjectId(),
        building: building._id,
        sensorType: "energy_meter",
      },
    },
    {
      timestamp: new Date("2026-01-02T00:00:00.000Z"),
      value: 2,
      unit: "kW",
      metadata: {
        sensor: new Types.ObjectId(),
        building: building._id,
        sensorType: "energy_meter",
      },
    },
    {
      timestamp: new Date("2026-01-15T12:00:00.000Z"),
      value: 20.5,
      unit: "°C",
      metadata: {
        sensor: new Types.ObjectId(),
        building: building._id,
        sensorType: "internal_temp",
      },
    },
  ]);

  await Alert.create({
    building: building._id,
    type: "threshold",
    severity: "high",
    value: 52.75,
    unit: "kWh",
    limit: 50,
    status: "active",
    createdAt: new Date("2026-01-10T08:00:00.000Z"),
  });
});

describe("GET /api/v1/reports", () => {
  test("rejects missing and reversed date ranges", async () => {
    const missingDateResponse = await client.api.v1.reports.$get(
      {
        // @ts-expect-error intentionally missing endDate
        query: {
          buildingIds: buildingId,
          startDate: "2026-01-01",
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(missingDateResponse.status).toBe(400);

    const reversedDateResponse = await client.api.v1.reports.$get(
      {
        query: {
          buildingIds: buildingId,
          startDate: "2026-02-01",
          endDate: "2026-01-01",
          format: "pdf",
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(reversedDateResponse.status).toBe(400);
  });

  test("rejects an invalid format", async () => {
    // SAFETY: "csv" deliberately violates the format enum so the server must reject it; `never` bypasses the client's query type.
    const response = await client.api.v1.reports.$get(
      {
        query: {
          buildingIds: buildingId,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          format: "csv" as never,
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    expect(response.status).toBe(400);
  });

  test("returns 404 when a selected building does not exist", async () => {
    const response = await client.api.v1.reports.$get(
      {
        query: {
          buildingIds: new Types.ObjectId().toString(),
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          format: "pdf",
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    expect(response.status).toBe(404);
  });


  test("returns a valid PDF file", async () => {
    const response = await client.api.v1.reports.$get(
      {
        query: {
          buildingIds: buildingId,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          format: "pdf",
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const body = await response.arrayBuffer();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      "wattguard-report-2026-01-01-2026-01-31.pdf",
    );
    // PDF magic bytes
    expect(new TextDecoder().decode(body.slice(0, 5))).toBe("%PDF-");
    expect(body.byteLength).toBeGreaterThan(1000);
  });

  test("returns a valid Excel file with the aggregated data", async () => {
    const response = await client.api.v1.reports.$get(
      {
        query: {
          buildingIds: buildingId,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          format: "xlsx",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Accept-Language": "it",
        },
      },
    );
    const body = await response.arrayBuffer();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toContain(
      "wattguard-report-2026-01-01-2026-01-31.xlsx",
    );
    // ZIP magic bytes (xlsx is a zip archive)
    const bytes = new Uint8Array(body);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body);

    const summary = workbook.getWorksheet("Riepilogo");
    expect(summary).toBeDefined();
    // SAFETY: ExcelJS stores row cells in an array-like object and these rows contain only scalar cells.
    const summaryRows = summary!.getRows(1, 2);
    // SAFETY: ExcelJS row values behave as an array of scalar cells for these rows.
    const header = summaryRows![0]!.values as unknown[];
    expect(header).toContain("Consumo totale (kWh)");

    // SAFETY: ExcelJS row values behave as an array of scalar cells for these rows.
    const row = summaryRows![1]!.values as unknown[];
    expect(row).toContain("Edificio Report");
    expect(row).toContain(48); // 2 kW × 24 h

    const daily = workbook.getWorksheet("Consumo giornaliero");
    expect(daily).toBeDefined();
    const dailyRows = daily!.getRows(1, 3) ?? [];
    expect(dailyRows).toHaveLength(3); // header + 2 days
    // SAFETY: ExcelJS row values behave as an array of scalar cells for these rows.
    const firstDay = dailyRows[1]!.values as unknown[];
    expect(firstDay).toContain(48);
    // SAFETY: ExcelJS row values behave as an array of scalar cells for these rows.
    const secondDay = dailyRows[2]!.values as unknown[];
    expect(secondDay).toContain(48);
  });


  test("localizes report labels for the requested language", async () => {
    const response = await client.api.v1.reports.$get(
      {
        query: {
          buildingIds: buildingId,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          format: "xlsx",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Accept-Language": "de",
        },
      },
    );
    const body = await response.arrayBuffer();

    expect(response.status).toBe(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body);

    const summary = workbook.getWorksheet("Zusammenfassung");
    expect(summary).toBeDefined();
    // SAFETY: ExcelJS stores row cells in an array-like object and these header rows contain only scalar cells.
    const header = summary!.getRow(1).values as unknown[];
    expect(header).toContain("Gesamtverbrauch (kWh)");
    expect(header).toContain("Gebäude");

    const daily = workbook.getWorksheet("Tagesverbrauch");
    expect(daily).toBeDefined();
    // SAFETY: ExcelJS stores row cells in an array-like object and this header row contains only scalar cells.
    const dailyHeader = daily!.getRow(1).values as unknown[];
    expect(dailyHeader).toContain("Gebäude");
  });
});
