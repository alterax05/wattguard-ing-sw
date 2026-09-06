/**
 * Building Type schemas
 * 
 * Routes: /api/v1/building-types (GET, POST), /api/v1/building-types/:id (PATCH, DELETE)
 */
import { z } from "zod";
import { ObjectIdSchema, IsoDateTimeSchema, ObjectIdParamSchema, SelfLinkSchema } from "./common";

/**
 * BuildingType response schema
 */
export const BuildingTypeSchema = z.object({
  self: SelfLinkSchema.optional(),
  _id: ObjectIdSchema.describe("Unique building type identifier"),
  name: z.string().describe("Building type name"),
  description: z.string().nullish().transform((v) => v ?? undefined).describe("Optional description of the building type"),
  createdAt: IsoDateTimeSchema.optional().describe("Creation timestamp"),
  updatedAt: IsoDateTimeSchema.optional().describe("Last update timestamp"),
}).meta({ id: "BuildingType" });


export type BuildingType = z.infer<typeof BuildingTypeSchema>;

/**
 * GET /api/v1/building-types - List all building types response
 */
export const ListBuildingTypesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(BuildingTypeSchema).describe("List of building types"),
}).meta({ id: "ListBuildingTypesResponse" });

export type ListBuildingTypesResponse = z.infer<typeof ListBuildingTypesResponseSchema>;

/**
 * GET /api/v1/building-types/:id - Get building type by ID parameter
 */
export const GetBuildingTypeParamsSchema = ObjectIdParamSchema;

export type GetBuildingTypeParams = z.infer<typeof GetBuildingTypeParamsSchema>;

/**
 * GET /api/v1/building-types/:id - Get building type by ID response
 * POST /api/v1/building-types - Create building type response
 * PATCH /api/v1/building-types/:id - Update building type response
 */
export const BuildingTypeResponseSchema = z.object({
  success: z.literal(true),
  data: BuildingTypeSchema,
}).meta({ id: "BuildingTypeResponse" });

export type BuildingTypeResponse = z.infer<typeof BuildingTypeResponseSchema>;

/**
 * POST /api/v1/building-types - Create building type request
 */
export const CreateBuildingTypeRequestSchema = z.object({
  name: z.string().min(1, "Name is required").trim().describe("Building type name"),
  description: z.string().trim().optional().describe("Optional description"),
}).meta({ id: "CreateBuildingTypeRequest" });

export type CreateBuildingTypeRequest = z.infer<typeof CreateBuildingTypeRequestSchema>;



/**
 * PATCH /api/v1/building-types/:id - Update building type path parameter
 */
export const UpdateBuildingTypeParamsSchema = ObjectIdParamSchema;

/**
 * PATCH /api/v1/building-types/:id - Update building type request
 */
export const UpdateBuildingTypeRequestSchema = CreateBuildingTypeRequestSchema.partial().meta({ id: "UpdateBuildingTypeRequest" });

export type UpdateBuildingTypeRequest = z.infer<typeof UpdateBuildingTypeRequestSchema>;

/**
 * DELETE /api/v1/building-types/:id - Delete building type path parameter
 */
export const DeleteBuildingTypeParamsSchema = ObjectIdParamSchema;
