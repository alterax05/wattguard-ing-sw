/**
 * Building Type schemas
 * 
 * Routes: /api/building-types (GET, POST), /api/building-types/:id (PATCH, DELETE)
 */
import { z } from "zod";
import { ErrorSchema, ObjectIdSchema } from "./common";

/**
 * BuildingType response schema
 */
export const BuildingTypeSchema = z.object({
  id: z.string().describe("Unique building type identifier"),
  name: z.string().describe("Building type name"),
  description: z.string().optional().describe("Optional description of the building type"),
  createdAt: z.iso.datetime().optional().describe("Creation timestamp"),
  updatedAt: z.iso.datetime().optional().describe("Last update timestamp"),
});

/**
 * GET /api/building-types - List all building types response
 */
export const ListBuildingTypesResponseSchema = z.object({
  buildingTypes: z.array(BuildingTypeSchema).describe("List of building types"),
});

/**
 * POST /api/building-types - Create building type request
 */
export const CreateBuildingTypeRequestSchema = z.object({
  name: z.string().min(1, "Name is required").trim().describe("Building type name"),
  description: z.string().trim().optional().describe("Optional description"),
});

/**
 * POST /api/building-types - Create building type response
 */
export const CreateBuildingTypeResponseSchema = z.object({
  success: z.literal(true),
  buildingType: BuildingTypeSchema,
});

/**
 * PATCH /api/building-types/:id - Update building type path parameter
 */
export const UpdateBuildingTypeParamsSchema = z.object({
  id: ObjectIdSchema.describe("Building type identifier"),
});

/**
 * PATCH /api/building-types/:id - Update building type request
 */
export const UpdateBuildingTypeRequestSchema = z.object({
  name: z.string().min(1, "Name is required").trim().optional().describe("Building type name"),
  description: z.string().trim().optional().describe("Optional description"),
});

/**
 * PATCH /api/building-types/:id - Update building type response
 */
export const UpdateBuildingTypeResponseSchema = z.object({
  success: z.literal(true),
  buildingType: BuildingTypeSchema,
});

/**
 * DELETE /api/building-types/:id - Delete building type path parameter
 */
export const DeleteBuildingTypeParamsSchema = z.object({
  id: ObjectIdSchema.describe("Building type identifier"),
});

/**
 * DELETE /api/building-types/:id - Delete building type response
 */
export const DeleteBuildingTypeResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().describe("Confirmation message"),
});

// Re-export for convenience
export { ErrorSchema };
