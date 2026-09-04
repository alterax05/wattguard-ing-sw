import { getRequestLocale } from "../lib/i18n";
import { Hono, type Context } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Types, type QueryFilter } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { Building } from "../models/Building";
import { SensorReading, type SensorReadingDocument } from "../models/SensorReading";
import {
  ErrorSchema,
  ExportConsumptionQuerySchema,
  ExportReportQuerySchema,
  type ExportReportQuery,
} from "@wattguard/shared";
import { serializeCsv } from "../lib/csv";
import {
  buildReportData,
  serializeReportPdf,
  serializeReportXlsx,
} from "../lib/report";
import { getUtcEndOfDay, getUtcStartOfDay } from "../lib/energy";

const CSV_HEADERS = [
  "timestamp",
  "buildingId",
  "buildingName",
  "sensorId",
  "sensorType",
  "value",
  "unit",
] as const;

function setDownloadHeaders(c: { header: (name: string, value: string) => void }, contentType: string, filename: string): void {
  c.header("Content-Type", contentType);
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  c.header("Cache-Control", "no-store");
}

async function handleEnergyReport(
  c: Context<{ Variables: AuthVariables }>,
  query: ExportReportQuery,
) {
  const { buildingIds, startDate, endDate, format: queryFormat } = query;
  const acceptHeader = c.req.header("accept") || "";
  const format =
    queryFormat ||
    (acceptHeader.includes("spreadsheetml") || acceptHeader.includes("excel")
      ? "xlsx"
      : "pdf");

  const requestedBuildingIds = [
    ...new Set(buildingIds.split(",").map((id) => id.trim())),
  ];

  const found = await Building.countDocuments({
    _id: { $in: requestedBuildingIds.map((id) => new Types.ObjectId(id)) },
  });
  if (found !== requestedBuildingIds.length) {
    return c.json({ error: "One or more buildings were not found", code: "buildings_not_found" }, 404);
  }

  const report = await buildReportData(requestedBuildingIds, startDate, endDate);
  const lang = getRequestLocale(c);

  if (format === "xlsx") {
    const buffer = await serializeReportXlsx(report, lang);
    setDownloadHeaders(
      c,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `wattguard-report-${startDate}-${endDate}.xlsx`,
    );

    return c.body(new Uint8Array(buffer));
  }

  const buffer = await serializeReportPdf(report, lang);
  setDownloadHeaders(c, "application/pdf", `wattguard-report-${startDate}-${endDate}.pdf`);

  return c.body(new Uint8Array(buffer));
}

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
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
        return c.json({ error: "One or more buildings were not found", code: "buildings_not_found" }, 404);
      }

      const buildingNames = new Map(
        buildings.map((building) => [building._id.toString(), building.name]),
      );
      const query: QueryFilter<SensorReadingDocument> = {
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

      setDownloadHeaders(c, "text/csv; charset=utf-8", filename);

      return c.body(csv);
    },
  )
  .get(
    "/energy",
    describeRoute({
      description:
        "Download an aggregated energy report for the selected buildings and period as PDF or Excel (admin only)",
      tags: ["Export"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Report file (PDF or Excel) containing aggregated consumption data",
          content: {
            "application/pdf": { schema: { type: "string", format: "binary" } },
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        400: {
          description: "Invalid report parameters",
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
    validator("query", ExportReportQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      return handleEnergyReport(c, query);
    },
  )
  .get(
    "/report",
    describeRoute({
      description:
        "Download an aggregated energy report for the selected buildings and period as PDF or Excel (admin only)",
      tags: ["Export"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Report file (PDF or Excel) containing aggregated consumption data",
          content: {
            "application/pdf": { schema: { type: "string", format: "binary" } },
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        400: {
          description: "Invalid report parameters",
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
    validator("query", ExportReportQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      return handleEnergyReport(c, query);
    },
  );


export default app;
export type AppType = typeof app;
