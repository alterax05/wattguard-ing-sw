import { z } from "zod";
import { 
  ErrorSchema, 
  ObjectIdSchema, 
  BuildingStatusSchema, 
  HeatingSystemTypeSchema,
  PaginationQuerySchema,
  SortOrderSchema,
  SensorTypeSchema,
} from "./common";
import { SensorSchema } from "./sensors";

/**
 * GeoJSON Point schema — { type: "Point", coordinates: [longitude, latitude] }
 */
export const GeoJSONPointSchema = z.object({
  type: z.literal("Point").describe("GeoJSON type"),
  coordinates: z.tuple([
    z.number().min(-180).max(180).describe("Longitude"),
    z.number().min(-90).max(90).describe("Latitude"),
  ]).describe("GeoJSON coordinates [longitude, latitude]"),
});

/**
 * Building response schema
 */
export const BuildingSummarySchema = z.object({
  id: ObjectIdSchema.describe("Unique building identifier"),
  name: z.string().describe("Building name"),
  address: z.string().describe("Building address"),
  surface: z.number().describe("Surface area in square meters"),
  ceilingHeight: z.number().describe("Ceiling height in meters"),
  location: GeoJSONPointSchema.describe("Geographic location as GeoJSON Point"),
  buildingType: z.union([
    z.string(), // ID
    z.object({
      id: ObjectIdSchema,
      name: z.string(),
      description: z.string().optional(),
    }),
  ]).describe("Building type (ID or populated object)"),
  heatingSystemType: z.string().describe("Type of heating system"),
  status: BuildingStatusSchema,
  geographicZone: z.string().describe("Geographic zone"),
  activeSensors: z.number().describe("Count of active sensors"),
  currentConsumption: z.number().nullable().describe("Latest energy meter reading in kWh, or null if unavailable"),
  updatedAt: z.iso.datetime().describe("Last update timestamp"),
});

/**
 * Building response schema
 */
export const BuildingDetailSchema = BuildingSummarySchema.extend({
  constructionYear: z.number().optional().describe("Year of construction"),
  createdBy: z.string().optional().describe("User who created this building"),
  updatedBy: z.string().optional().describe("User who last updated this building"),
  createdAt: z.iso.datetime().optional().describe("Creation timestamp"),
});

/**
 * GET /api/buildings 
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

/**
 * GET /api/buildings
 */
export const SearchBuildingsResponseSchema = z.object({
  buildings: z.array(BuildingSummarySchema).describe("List of buildings matching search criteria"),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }).describe("Pagination information"),
});

/**
 * POST /api/buildings - Create building request
 * 
 */
export const CreateBuildingRequestSchema = z.object({
  name: z.string().min(1, "Name is required").trim().describe("Building name"),
  address: z.string().min(1, "Address is required").trim().describe("Building address"),
  surface: z.number().min(0, "Surface must be positive").describe("Surface area in square meters"),
  ceilingHeight: z.number().min(0.5, "Height must be at least 0.5m").max(20).default(3.0).describe("Ceiling height in meters"),
  location: GeoJSONPointSchema.describe("Geographic location as GeoJSON Point"),
  buildingType: ObjectIdSchema.describe("Building type identifier"),
  heatingSystemType: HeatingSystemTypeSchema.describe("Type of heating system"),
  constructionYear: z.number().min(1000).max(new Date().getFullYear() + 10).optional().describe("Year of construction"),
  geographicZone: z.string().min(1, "Geographic zone is required").trim().describe("Geographic zone"),
});

/**
 * POST /api/buildings - Create building response
 */
export const CreateBuildingResponseSchema = z.object({
  success: z.literal(true),
  building: BuildingDetailSchema,
});

/**
 * GET /api/buildings/:id - Get building path parameter
 */
export const GetBuildingParamsSchema = z.object({
  id: ObjectIdSchema.describe("Building identifier"),
});

/**
 * GET /api/buildings/:id - Get building response 
 */
export const GetBuildingResponseSchema = z.object({
  building: BuildingDetailSchema,
});

/**
 * PATCH /api/buildings/:id - Update building path parameter
 */
export const UpdateBuildingParamsSchema = z.object({
  id: ObjectIdSchema.describe("Building identifier"),
});

/**
 * PATCH /api/buildings/:id - Update building request
 */
export const UpdateBuildingRequestSchema = z.object({
  name: z.string().min(1).trim().optional().describe("Building name"),
  address: z.string().min(1).trim().optional().describe("Building address"),
  surface: z.number().min(0).optional().describe("Surface area in square meters"),
  ceilingHeight: z.number().min(0.5).max(20).optional().describe("Ceiling height in meters"),
  location: GeoJSONPointSchema.optional().describe("Geographic location as GeoJSON Point"),
  buildingType: ObjectIdSchema.optional().describe("Building type identifier"),
  heatingSystemType: HeatingSystemTypeSchema.optional().describe("Type of heating system"),
  constructionYear: z.number().min(1000).max(new Date().getFullYear() + 10).optional().describe("Year of construction"),
  geographicZone: z.string().min(1).trim().optional().describe("Geographic zone"),
  status: BuildingStatusSchema.optional().describe("Building status"),
});

/**
 * PATCH /api/buildings/:id - Update building response
 */
export const UpdateBuildingResponseSchema = z.object({
  success: z.literal(true),
  building: BuildingDetailSchema,
});

/**
 * DELETE /api/buildings/:id - Delete building path parameter
 */
export const DeleteBuildingParamsSchema = z.object({
  id: ObjectIdSchema.describe("Building identifier"),
});

/**
 * DELETE /api/buildings/:id - Delete building response
 */
export const DeleteBuildingResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().describe("Confirmation message"),
});

/**
 * GET /api/buildings/:id/sensors - Get building sensors response
 */
export const GetBuildingSensorsResponseSchema = z.object({
  sensors: z.array(SensorSchema).describe("List of sensors installed in the building"),
});

/**
 * Real-time data schema 
 */
export const RealTimeDataSchema = z.object({
  internalTemperature: z.object({
    value: z.number().nullable(),
    unit: z.string(),
    timestamp: z.iso.datetime().nullable(),
    sensorId: ObjectIdSchema.nullable(),
  }).describe("Current internal temperature"),
  externalTemperature: z.object({
    value: z.number().nullable(),
    unit: z.string(),
    timestamp: z.iso.datetime().nullable(),
    sensorId: ObjectIdSchema.nullable(),
  }).describe("Current external temperature"),
  energyConsumption: z.object({
    value: z.number().nullable(),
    unit: z.string(),
    timestamp: z.iso.datetime().nullable(),
    sensorId: ObjectIdSchema.nullable(),
  }).describe("Current instantaneous energy consumption"),
});

/**
 * GET /api/buildings/:id/real-time - Get building real-time data response
 */
export const GetBuildingRealTimeResponseSchema = z.object({
  buildingId: ObjectIdSchema,
  buildingName: z.string(),
  timestamp: z.iso.datetime().describe("Timestamp of this snapshot"),
  data: RealTimeDataSchema,
});

/**
 * GET /api/buildings/:id/history - Get building historical data query parameters
 */
export const GetBuildingHistoryQuerySchema = z.object({
  startDate: z.iso.datetime().describe("Start date for historical data"),
  endDate: z.iso.datetime().describe("End date for historical data"),
  sensorType: z.enum(["internal_temp", "external_temp", "energy_meter", "gas_meter"]).optional().describe("Filter by sensor type"),
  interval: z.enum(["minute", "hour", "day"]).optional().describe("Data aggregation interval (default: hour)"),
});

/**
 * Historical data point schema
 */
export const HistoricalDataPointSchema = z.object({
  timestamp: z.iso.datetime(),
  value: z.number(),
  unit: z.string(),
  sensorType: SensorTypeSchema,
  sensorId: z.string().optional(),
});

/**
 * GET /api/buildings/:id/history - Get building historical data response
 */
export const GetBuildingHistoryResponseSchema = z.object({
  buildingId: ObjectIdSchema,
  buildingName: z.string(),
  period: z.object({
    startDate: z.iso.datetime(),
    endDate: z.iso.datetime(),
  }),
  data: z.array(HistoricalDataPointSchema).describe("Historical data points for graphing"),
});

/**
 * GET /api/buildings/:id/efficiency - Efficiency query parameters
 */
export const GetBuildingEfficiencyQuerySchema = z.object({
  startDate: z.iso.datetime().describe("Start date for efficiency calculation"),
  endDate: z.iso.datetime().describe("End date for efficiency calculation"),
});

/**
 * GET /api/buildings/:id/efficiency - Efficiency response
 */
export const GetBuildingEfficiencyResponseSchema = z.object({
  buildingId: ObjectIdSchema,
  buildingName: z.string(),
  period: z.object({
    startDate: z.iso.datetime(),
    endDate: z.iso.datetime(),
  }),
  metrics: z.object({
    totalEnergyConsumed: z.number().describe("Total energy consumed in kWh"),
    averageExternalTemperature: z.number().nullable().describe("Average external temperature during period"),
    estimatedHeatLossCoefficient: z.number().nullable().describe("Estimated Heat Loss Coefficient (W/K)"),
    insulationQuality: z.number().nullable().describe("Insulation Quality (W/(m²·K))"),
    averageCop: z.number().nullable().describe("Average Coefficient of Performance (COP)"),
  }),
});

// Re-export for convenience
export { ErrorSchema };
