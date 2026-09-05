import { z } from "zod";
import { ObjectIdSchema } from "./common";

const BuildingIdsQuerySchema = z
  .string()
  .min(1, "At least one building ID is required")
  .refine(
    (value) =>
      value.split(",").every((id) => ObjectIdSchema.safeParse(id.trim()).success),
    "buildingIds must be a comma-separated list of valid MongoDB ObjectIds",
  )
  .describe("Comma-separated list of building IDs to include in the report");

/**
 * GET /api/v1/reports - Aggregated admin report query parameters
 *
 * Admin-only. Dates are calendar dates (YYYY-MM-DD); the endpoint includes
 * the complete UTC day for both boundaries, which matches the values
 * submitted by an HTML date input. The `format` query parameter selects the
 * serialization and takes precedence over the request `Accept` header;
 * it defaults to `pdf` when omitted.
 *
 * Note: raw readings export (CSV/JSON) lives on GET /api/v1/readings and is
 * validated by `ReadingsQuerySchema` from `./readings`, not here.
 */
export const ExportReportQuerySchema = z
  .object({
    buildingIds: BuildingIdsQuerySchema,
    startDate: z.string().date().describe("First date to include (YYYY-MM-DD)"),
    endDate: z.string().date().describe("Last date to include (YYYY-MM-DD)"),
    format: z
      .enum(["pdf", "xlsx"])
      .default("pdf")
      .describe("Report file format (pdf or xlsx)"),
  })
  .refine(({ startDate, endDate }) => startDate <= endDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

export type ExportReportQuery = z.input<typeof ExportReportQuerySchema>;
