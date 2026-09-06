import { Hono, type Context } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Types, type QueryFilter } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { Building } from "../models/Building";
import { SensorReading, type SensorReadingDocument } from "../models/SensorReading";
import { serializeCsv } from "../lib/csv";
import { getUtcEndOfDay, getUtcStartOfDay } from "../lib/energy";
import {
  ReadingsQuerySchema,
  ErrorSchema,
} from "@wattguard/shared";
import type { ErrorResponse } from "@wattguard/shared";
import { apiError } from "../lib/api-response";

const CSV_HEADERS = [
  "timestamp",
  "buildingId",
  "buildingName",
  "sensorId",
  "sensorType",
  "value",
  "unit",
] as const;

function setDownloadHeaders(c: Context, contentType: string, filename: string): void {
  c.header("Content-Type", contentType);
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  c.header("Cache-Control", "no-store");
}

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      summary: "Export readings",
      description:
        "Exports filtered readings for buildings and period as CSV or JSON (admin only)",
      tags: ["Readings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Readings in requested format (CSV or JSON)",
          content: {
            "text/csv": { schema: { type: "string" } },
            "application/json": { schema: { type: "object" } },
          },
        },
        400: {
          description: "Invalid query parameters",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        401: {
          description: "Unauthorized",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        403: {
          description: "Forbidden - requires admin role",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        404: {
          description: "One or more buildings were not found",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    validator("query", ReadingsQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const { buildingIds, startDate, endDate, format: queryFormat } = query;

      const acceptHeader = c.req.header("accept") || "";
      const isCsv = queryFormat === "csv" || acceptHeader.includes("text/csv");

      const filter: QueryFilter<SensorReadingDocument> = {};

      let buildingNames = new Map<string, string>();

      if (buildingIds) {
        const requestedBuildingIds = [
          ...new Set(buildingIds.split(",").map((id) => id.trim())),
        ];
        const objectIds = requestedBuildingIds.map((id) => new Types.ObjectId(id));

        const buildings = await Building.find({ _id: { $in: objectIds } })
          .select("_id name")
          .lean();

        if (buildings.length !== requestedBuildingIds.length) {
          return c.json(apiError("buildings_not_found", "One or more buildings were not found") satisfies ErrorResponse, 404);
        }

        buildingNames = new Map(
          buildings.map((b) => [b._id.toString(), b.name]),
        );

        filter["metadata.building"] = { $in: objectIds };
      }

      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) {
          filter.timestamp.$gte = getUtcStartOfDay(startDate);
        }
        if (endDate) {
          filter.timestamp.$lte = getUtcEndOfDay(endDate);
        }
      }

      const readings = await SensorReading.find(filter)
        .sort({ timestamp: 1, "metadata.building": 1, "metadata.sensorType": 1 })
        .lean();

      const dateStr = new Date().toISOString().slice(0, 10);

      if (isCsv) {
        const csv = serializeCsv(
          CSV_HEADERS,
          readings.map((reading) => {
            const buildingId = reading.metadata.building.toString();
            return [
              reading.timestamp,
              buildingId,
              buildingNames.get(buildingId) ?? "",
              reading.metadata.sensor.toString(),
              reading.metadata.sensorType,
              reading.value,
              reading.unit,
            ];
          }),
        );
        const filename = `wattguard-consumption-${startDate ?? dateStr}-${endDate ?? dateStr}.csv`;
        setDownloadHeaders(c, "text/csv; charset=utf-8", filename);
        return c.body(csv);
      }

      const exportData = {
        exportedAt: new Date().toISOString(),
        totalRecords: readings.length,
        readings: readings.map((r) => ({
          _id: r._id?.toString(),
          timestamp: r.timestamp,
          value: r.value,
          unit: r.unit,
          sensorId: r.metadata.sensor?.toString(),
          buildingId: r.metadata.building?.toString(),
          sensorType: r.metadata.sensorType,
        })),
      };

      const filename = `wattguard-readings-${dateStr}.json`;
      setDownloadHeaders(c, "application/json", filename);
      return c.body(JSON.stringify(exportData, null, 2));
    }
  );

export default app;
export type AppType = typeof app;
