import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Types, type QueryFilter } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { Building } from "../models/Building";
import { SensorReading, type ISensorReading } from "../models/SensorReading";
import { ErrorSchema, ExportConsumptionQuerySchema } from "../schemas/export";
import { serializeCsv } from "../lib/csv";

const CSV_HEADERS = [
  "timestamp",
  "buildingId",
  "buildingName",
  "sensorId",
  "sensorType",
  "value",
  "unit",
] as const;

function getUtcStartOfDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function getUtcEndOfDay(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

const app = new Hono<{ Variables: AuthVariables }>().get(
  "/consumption",
  describeRoute({
    description:
      "Download selected buildings' temperature and consumption readings as CSV (admin only)",
    tags: ["Export"],
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    responses: {
      200: {
        description: "CSV file containing the selected sensor readings",
        content: {
          "text/csv": {
            schema: { type: "string" },
          },
        },
      },
      400: {
        description: "Invalid export parameters",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      403: {
        description: "Forbidden - requires admin role",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      404: {
        description: "One or more buildings were not found",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  validator("query", ExportConsumptionQuerySchema),
  async (c) => {
    const { buildingIds, startDate, endDate } = c.req.valid("query");
    const requestedBuildingIds = [
      ...new Set(buildingIds.split(",").map((id) => id.trim())),
    ];
    const objectIds = requestedBuildingIds.map((id) => new Types.ObjectId(id));

    const buildings = await Building.find({ _id: { $in: objectIds } })
      .select("_id name")
      .lean();

    if (buildings.length !== requestedBuildingIds.length) {
      return c.json({ error: "One or more buildings were not found" }, 404);
    }

    const buildingNames = new Map(
      buildings.map((building) => [building._id.toString(), building.name]),
    );
    const query: QueryFilter<ISensorReading> = {
      "metadata.buildingId": { $in: objectIds },
      timestamp: {
        $gte: getUtcStartOfDay(startDate),
        $lte: getUtcEndOfDay(endDate),
      },
    };

    const readings = await SensorReading.find(query)
      .sort({ timestamp: 1, "metadata.buildingId": 1, "metadata.sensorType": 1 })
      .lean();

    const csv = serializeCsv(
      CSV_HEADERS,
      readings.map((reading) => {
        const buildingId = reading.metadata.buildingId.toString();

        return [
          reading.timestamp,
          buildingId,
          buildingNames.get(buildingId),
          reading.metadata.sensorId.toString(),
          reading.metadata.sensorType,
          reading.value,
          reading.unit,
        ];
      }),
    );
    const filename = `wattguard-consumption-${startDate}-${endDate}.csv`;

    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    c.header("Cache-Control", "no-store");

    return c.body(csv);
  },
);

export default app;
export type AppType = typeof app;
