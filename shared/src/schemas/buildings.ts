import { z } from "zod";
import {
  ObjectIdSchema,
  IsoDateTimeSchema,
  BuildingStatusSchema,
  HeatingSystemTypeSchema,
  PaginationQuerySchema,
  PaginationResponseSchema,
  PeriodSchema,
  ObjectIdParamSchema,
  SortOrderSchema,
  SensorTypeSchema,
  SelfLinkSchema,
  ResourceIdOrUriSchema,
} from "./common";
import { BuildingTypeSchema } from "./building-types";

/**
 * GeoJSON Point schema — { type: "Point", coordinates: [longitude, latitude] }
 */
export const GeoJSONPointSchema = z.object({
  type: z.literal("Point").describe("GeoJSON type"),
  coordinates: z.tuple([
    z.number().min(-180).max(180).describe("Longitude"),
    z.number().min(-90).max(90).describe("Latitude"),
  ]).describe("GeoJSON coordinates [longitude, latitude]"),
}).meta({ id: "GeoJSONPoint" });

export type GeoJSONPoint = z.infer<typeof GeoJSONPointSchema>;

/**
 * Building response schema
 */
export const BuildingSummarySchema = z.object({
  self: SelfLinkSchema.optional(),
  _id: ObjectIdSchema.describe("Unique building identifier"),
  name: z.string().describe("Building name"),
  address: z.string().describe("Building address"),
  surface: z.number().describe("Surface area in square meters"),
  ceilingHeight: z.number().describe("Ceiling height in meters"),
  location: GeoJSONPointSchema.describe("Geographic location as GeoJSON Point"),
  buildingType: z.union([
    ObjectIdSchema.describe("Building type identifier"),
    BuildingTypeSchema,
  ]).describe("Building type (ID or populated object)"),
  heatingSystemType: z.string().describe("Type of heating system"),
  status: BuildingStatusSchema,
  geographicZone: z.string().describe("Geographic zone"),
  activeSensors: z.number().default(0).describe("Count of active sensors"),
  currentConsumption: z.number().nullable().default(null).describe("Latest energy meter reading in kWh, or null if unavailable"),
  updatedAt: IsoDateTimeSchema.default(() => new Date().toISOString()).describe("Last update timestamp"),
}).meta({ id: "BuildingSummary" });


export type BuildingSummary = z.infer<typeof BuildingSummarySchema>;

/**
 * Efficiency alert thresholds — alert when average COP drops below minCop
 */
export const EfficiencyThresholdsSchema = z.object({
  enabled: z.boolean().describe("Enable automatic efficiency alerts"),
  minCop: z.number().min(0).max(10).nullable().describe("Minimum average COP; alert when below"),
}).superRefine((v, ctx) => {
  if (v.enabled && v.minCop == null) {
    ctx.addIssue({ code: "custom", path: ["minCop"], message: "minCop is required when enabled" });
  }
}).meta({ id: "EfficiencyThresholds" });

export type EfficiencyThresholds = z.infer<typeof EfficiencyThresholdsSchema>;

/**
 * Building response schema
 */
export const BuildingDetailSchema = BuildingSummarySchema.extend({
  constructionYear: z.number().int().nullish().transform((v) => v ?? undefined).describe("Year of construction"),
  efficiencyThresholds: EfficiencyThresholdsSchema,
  createdBy: ObjectIdSchema.optional().describe("User who created this building"),
  updatedBy: ObjectIdSchema.optional().describe("User who last updated this building"),
  createdAt: IsoDateTimeSchema.optional().describe("Creation timestamp"),
}).meta({ id: "BuildingDetail" });

export type BuildingDetail = z.infer<typeof BuildingDetailSchema>;

/**
 * GET /api/v1/buildings 
 */
export const SearchBuildingsQuerySchema = PaginationQuerySchema.extend({
  name: z.string().optional().describe("Filter by building name (partial match)"),
  address: z.string().optional().describe("Filter by address (partial match)"),
  zone: z.string().optional().describe("Filter by geographic zone"),
  buildingType: ObjectIdSchema.optional().describe("Filter by building type ID"),
  status: BuildingStatusSchema.optional().describe("Filter by operational status"),
  sortBy: z.enum(["name", "createdAt", "updatedAt"]).optional().describe("Sort field (default: updatedAt)"),
  sortOrder: SortOrderSchema.optional().describe("Sort order (default: desc)"),
});

export type SearchBuildingsQuery = z.input<typeof SearchBuildingsQuerySchema>;

/**
 * GET /api/v1/buildings
 */
export const SearchBuildingsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    buildings: z.array(BuildingSummarySchema).describe("List of buildings matching search criteria"),
    pagination: PaginationResponseSchema,
  }),
}).meta({ id: "SearchBuildingsResponse" });

export type SearchBuildingsResponse = z.infer<typeof SearchBuildingsResponseSchema>;

/**
 * POST /api/v1/buildings - Create building request
 * 
 */
export const CreateBuildingRequestSchema = z.object({
  name: z.string().min(1, "Name is required").trim().describe("Building name"),
  address: z.string().min(1, "Address is required").trim().describe("Building address"),
  surface: z.number().min(1, "Surface must be positive").describe("Surface area in square meters"),
  ceilingHeight: z.number().min(0.5, "Height must be at least 0.5m").max(20).default(3.0).describe("Ceiling height in meters"),
  location: GeoJSONPointSchema.describe("Geographic location as GeoJSON Point"),
  buildingType: ResourceIdOrUriSchema.describe("Building type identifier or URI"),
  heatingSystemType: HeatingSystemTypeSchema.describe("Type of heating system"),
  constructionYear: z.number().min(1000).max(new Date().getFullYear() + 10).optional().describe("Year of construction"),
  geographicZone: z.string().min(1, "Geographic zone is required").trim().describe("Geographic zone"),
  efficiencyThresholds: EfficiencyThresholdsSchema.optional(),
}).meta({ id: "CreateBuildingRequest" });

export type CreateBuildingRequest = z.infer<typeof CreateBuildingRequestSchema>;

/**
 * POST /api/v1/buildings - Create building response
 * GET /api/v1/buildings/:id - Get building response
 * PATCH /api/v1/buildings/:id - Update building response
 */
export const BuildingResponseSchema = z.object({
  success: z.literal(true),
  data: BuildingDetailSchema,
}).meta({ id: "BuildingResponse" });

export type BuildingResponse = z.infer<typeof BuildingResponseSchema>;

/**
 * GET /api/v1/buildings/:id - Get building path parameter
 */
export const GetBuildingParamsSchema = ObjectIdParamSchema;



/**
 * PATCH /api/v1/buildings/:id - Update building path parameter
 */
export const UpdateBuildingParamsSchema = ObjectIdParamSchema;

/**
 * PATCH /api/v1/buildings/:id - Update building request
 */
export const UpdateBuildingRequestSchema = CreateBuildingRequestSchema.partial().extend({
  ceilingHeight: z.number().min(0.5).max(20).optional().describe("Ceiling height in meters"),
  status: BuildingStatusSchema.optional().describe("Building status"),
  efficiencyThresholds: EfficiencyThresholdsSchema.optional(),
}).meta({ id: "UpdateBuildingRequest" });

export type UpdateBuildingRequest = z.infer<typeof UpdateBuildingRequestSchema>;

/**
 * DELETE /api/v1/buildings/:id - Delete building path parameter
 */
export const DeleteBuildingParamsSchema = ObjectIdParamSchema;

/**
 * GET /api/v1/buildings/:id/readings - Get building historical data query parameters.
 * `limit=1&sortOrder=desc` returns the latest point per query
 * (replaces the removed GET /:id/readings/latest snapshot).
 */
export const GetBuildingHistoryQuerySchema = z.object({
  startDate: z.iso.datetime().describe("Start date for historical data"),
  endDate: z.iso.datetime().describe("End date for historical data"),
  sensorType: z.enum(["internal_temp", "external_temp", "energy_meter", "gas_meter"]).optional().describe("Filter by sensor type"),
  interval: z.enum(["minute", "hour", "day"]).optional().describe("Data aggregation interval (default: hour)"),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1000))
    .pipe(z.number().min(1).max(1000))
    .describe("Maximum number of points (1-1000, default: 1000). Use limit=1&sortOrder=desc for the latest point"),
  sortOrder: SortOrderSchema.optional().default("asc").describe("Sort order by timestamp (default: asc)"),
});

export type GetBuildingHistoryQuery = z.input<typeof GetBuildingHistoryQuerySchema>;

/**
 * Historical data point schema
 */
export const HistoricalDataPointSchema = z.object({
  timestamp: z.iso.datetime(),
  value: z.number(),
  unit: z.string(),
  sensorType: SensorTypeSchema,
  sensorId: z.string().optional(),
}).meta({ id: "HistoricalDataPoint" });

export type HistoricalDataPoint = z.infer<typeof HistoricalDataPointSchema>;

/**
 * GET /api/v1/buildings/:id/readings - Get building historical data response
 */
export const HistoricalDataResponseSchema = z.object({
  buildingId: ObjectIdSchema,
  buildingName: z.string(),
  period: PeriodSchema,
  data: z.array(HistoricalDataPointSchema).describe("Historical data points for graphing"),
}).meta({ id: "HistoricalDataResponse" });

export type HistoricalData = z.infer<typeof HistoricalDataResponseSchema>;

export const GetBuildingHistoryResponseSchema = z.object({
  success: z.literal(true),
  data: HistoricalDataResponseSchema,
}).meta({ id: "GetBuildingHistoryResponse" });

export type GetBuildingHistoryResponse = z.infer<typeof GetBuildingHistoryResponseSchema>;

/**
 * GET /api/v1/buildings/:id/efficiency - Efficiency query parameters
 */
export const GetBuildingEfficiencyQuerySchema = z.object({
  startDate: z.iso.datetime().describe("Start date for efficiency calculation"),
  endDate: z.iso.datetime().describe("End date for efficiency calculation"),
});

export type GetBuildingEfficiencyQuery = z.input<typeof GetBuildingEfficiencyQuerySchema>;

/**
 * GET /api/v1/buildings/:id/efficiency - Efficiency response
 */
export const BuildingEfficiencyDataSchema = z.object({
  buildingId: ObjectIdSchema,
  buildingName: z.string(),
  period: PeriodSchema,
  metrics: z.object({
    totalEnergyConsumed: z.number().describe("Total energy consumed in kWh"),
    averageExternalTemperature: z.number().nullable().describe("Average external temperature during period"),
    estimatedHeatLossCoefficient: z.number().nullable().describe("Estimated Heat Loss Coefficient (W/K)"),
    insulationQuality: z.number().nullable().describe("Insulation Quality (W/(m²·K))"),
    averageCop: z.number().nullable().describe("Average Coefficient of Performance (COP)"),
  }),
}).meta({ id: "BuildingEfficiencyData" });

export type EfficiencyMetrics = z.infer<typeof BuildingEfficiencyDataSchema>;
export type BuildingEfficiencyMetrics = EfficiencyMetrics["metrics"];

export const GetBuildingEfficiencyResponseSchema = z.object({
  success: z.literal(true),
  data: BuildingEfficiencyDataSchema,
}).meta({ id: "GetBuildingEfficiencyResponse" });

export type GetBuildingEfficiencyResponse = z.infer<typeof GetBuildingEfficiencyResponseSchema>;

