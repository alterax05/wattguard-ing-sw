import { z } from "zod";
import { ErrorSchema, ObjectIdSchema } from "./common";

const BuildingIdsQuerySchema = z
  .string()
  .min(1, "At least one building ID is required")
  .refine(
    (value) =>
      value.split(",").every((id) => ObjectIdSchema.safeParse(id.trim()).success),
    "buildingIds must be a comma-separated list of valid MongoDB ObjectIds",
  )
  .describe("Comma-separated list of building IDs to export");

/**
 * GET /api/export/consumption - Consumption export query parameters
 *
 * Dates are calendar dates. The endpoint includes the complete UTC day for
 * both boundaries, which matches the values submitted by an HTML date input.
 */
export const ExportConsumptionQuerySchema = z
  .object({
    buildingIds: BuildingIdsQuerySchema,
    startDate: z.string().date().describe("First date to include (YYYY-MM-DD)"),
    endDate: z.string().date().describe("Last date to include (YYYY-MM-DD)"),
  })
  .refine(({ startDate, endDate }) => startDate <= endDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

export { ErrorSchema };
