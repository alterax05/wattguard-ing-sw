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
  .describe("Comma-separated list of building IDs");

export const ReadingsQuerySchema = z
  .object({
    buildingIds: BuildingIdsQuerySchema.optional(),
    startDate: z.string().date().optional().describe("First date to include (YYYY-MM-DD)"),
    endDate: z.string().date().optional().describe("Last date to include (YYYY-MM-DD)"),
    format: z.enum(["csv", "json"]).optional().describe("Representation format"),
  })
  .refine(
    (data) => {
      if (data.buildingIds) {
        return Boolean(data.startDate && data.endDate);
      }
      return true;
    },
    {
      message: "startDate and endDate are required when buildingIds is specified",
      path: ["startDate"],
    }
  )
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: "endDate must be on or after startDate",
      path: ["endDate"],
    }
  );

export type ReadingsQuery = z.input<typeof ReadingsQuerySchema>;
