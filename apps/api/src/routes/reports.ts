import { Hono, type Context } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Types } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { Building } from "../models/Building";
import { getRequestLocale } from "../lib/i18n";
import {
  buildReportData,
  serializeReportPdf,
  serializeReportXlsx,
} from "../lib/report";
import {
  ExportReportQuerySchema,
  ErrorSchema,
} from "@wattguard/shared";
import type { ErrorResponse } from "@wattguard/shared";
import { apiError } from "../lib/api-response";

function setDownloadHeaders(c: Context, contentType: string, filename: string): void {
  c.header("Content-Type", contentType);
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  c.header("Cache-Control", "no-store");
}

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      summary: "Download energy report",
      description:
        "Generates the aggregated report for buildings and period as PDF or Excel (admin only)",
      tags: ["Reports"],
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
    validator("query", ExportReportQuerySchema),
    async (c) => {
      const { buildingIds, startDate, endDate, format: queryFormat } = c.req.valid("query");
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
        return c.json(apiError("buildings_not_found", "One or more buildings were not found") satisfies ErrorResponse, 404);
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
  );

export default app;
export type AppType = typeof app;
