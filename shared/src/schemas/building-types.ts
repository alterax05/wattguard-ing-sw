/**
 * Building Type schemas
 * 
 * Routes: /api/v1/building-types (GET, POST), /api/v1/building-types/:id (PATCH, DELETE)
 */
import { z } from "zod";
import { ObjectIdSchema, IsoDateTimeSchema, ObjectIdParamSchema } from "./common";

/**
 * BuildingType response schema
 */
export const BuildingTypeSchema = z.object({
  _id: ObjectIdSchema.describe("Unique building type identifier"),
  name: z.string().describe("Building type name"),
  description: z.string().nullish().transform((v) => v ?? undefined).describe("Optional description of the building type"),
  createdAt: IsoDateTimeSchema.optional().describe("Creation timestamp"),
  updatedAt: IsoDateTimeSchema.optional().describe("Last update timestamp"),
});


export type BuildingType = z.infer<typeof BuildingTypeSchema>;

/**
 * GET /api/v1/building-types - List all building types response
 */
export const ListBuildingTypesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(BuildingTypeSchema).describe("List of building types"),
});

export type ListBuildingTypesResponse = z.infer<typeof ListBuildingTypesResponseSchema>;

/**
 * POST /api/v1/building-types - Create building type request
 */
export const CreateBuildingTypeRequestSchema = z.object({
  name: z.string().min(1, "Name is required").trim().describe("Building type name"),
  description: z.string().trim().optional().describe("Optional description"),
});

export type CreateBuildingTypeRequest = z.infer<typeof CreateBuildingTypeRequestSchema>;

/**
 * POST /api/v1/building-types - Create building type response
 */
export const CreateBuildingTypeResponseSchema = z.object({
  success: z.literal(true),
  data: BuildingTypeSchema,
});

export type CreateBuildingTypeResponse = z.infer<typeof CreateBuildingTypeResponseSchema>;

/**
 * PATCH /api/v1/building-types/:id - Update building type path parameter
 */
export const UpdateBuildingTypeParamsSchema = ObjectIdParamSchema;

/**
 * PATCH /api/v1/building-types/:id - Update building type request
 */
export const UpdateBuildingTypeRequestSchema = CreateBuildingTypeRequestSchema.partial();

export type UpdateBuildingTypeRequest = z.infer<typeof UpdateBuildingTypeRequestSchema>;

/**
 * PATCH /api/v1/building-types/:id - Update building type response
 */
export const UpdateBuildingTypeResponseSchema = z.object({
  success: z.literal(true),
  data: BuildingTypeSchema,
});

export type UpdateBuildingTypeResponse = z.infer<typeof UpdateBuildingTypeResponseSchema>;

/**
 * DELETE /api/v1/building-types/:id - Delete building type path parameter
 */
export const DeleteBuildingTypeParamsSchema = ObjectIdParamSchema;

/**
 * DELETE /api/v1/building-types/:id - Delete building type response
 */
export const DeleteBuildingTypeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().describe("Deleted building type identifier"),
    message: z.string().optional().describe("Deletion message"),
  }),
});

export type DeleteBuildingTypeResponse = z.infer<typeof DeleteBuildingTypeResponseSchema>;
