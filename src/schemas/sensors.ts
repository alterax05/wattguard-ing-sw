import { z } from "zod";
import { 
  ErrorSchema, 
  ObjectIdSchema, 
  SensorTypeSchema, 
  SensorStatusSchema,
  PaginationQuerySchema,
  SortOrderSchema,
} from "./common";

/**
 * LastReading schema
 */
export const LastReadingSchema = z.object({
  value: z.number().describe("Reading value"),
  timestamp: z.iso.datetime().describe("Timestamp of the reading"),
  unit: z.string().describe("Unit of measurement (e.g., °C, W, kWh)"),
});

/**
 * Sensor response schema
 */
export const SensorSchema = z.object({
  id: ObjectIdSchema.describe("Unique sensor identifier"),
  buildingId: ObjectIdSchema.describe("Building identifier this sensor belongs to"),
  sensorType: SensorTypeSchema,
  location: z.string().describe("Physical location of the sensor in the building"),
  serialNumber: z.string().optional().describe("Optional sensor serial number"),
  installationDate: z.iso.datetime().describe("Date when sensor was installed"),
  status: SensorStatusSchema,
  lastReading: LastReadingSchema.optional().describe("Most recent reading (denormalized for performance)"),
  transmissionInterval: z.number().describe("Data transmission interval in seconds (default: 90)"),
  minThreshold: z.number().optional().describe("Minimum threshold for alerts"),
  maxThreshold: z.number().optional().describe("Maximum threshold for alerts"),
  createdBy: ObjectIdSchema.optional().describe("User who created this sensor"),
  updatedBy: ObjectIdSchema.optional().describe("User who last updated this sensor"),
  createdAt: z.iso.datetime().optional().describe("Creation timestamp"),
  updatedAt: z.iso.datetime().optional().describe("Last update timestamp"),
});

/**
 * Sensor with building details (populated)
 */
export const SensorWithBuildingSchema = SensorSchema.extend({
  isOffline: z.boolean().describe("Whether the sensor is currently offline"),
  building: z.object({
    id: z.string(),
    name: z.string(),
    address: z.string(),
  }).optional().describe("Building details (if populated)"),
});

/**
 * POST /api/sensors - Create sensor request
 */
export const CreateSensorRequestSchema = z.object({
  buildingId: ObjectIdSchema.describe("Building identifier"),
  sensorType: SensorTypeSchema,
  location: z.string().min(1, "Location is required").trim().describe("Physical location in the building"),
  serialNumber: z.string().trim().optional().describe("Optional sensor serial number"),
  installationDate: z.iso.datetime().optional().describe("Date when sensor was installed (defaults to now)"),
  transmissionInterval: z.number().min(10).max(3600).optional().describe("Transmission interval in seconds (default: 90)"),
  minThreshold: z.number().optional().describe("Minimum threshold for alerts"),
  maxThreshold: z.number().optional().describe("Maximum threshold for alerts"),
});

/**
 * POST /api/sensors - Create sensor response
 */
export const CreateSensorResponseSchema = z.object({
  success: z.literal(true),
  sensor: SensorSchema,
});

/**
 * GET /api/sensors/:id - Get sensor path parameter
 */
export const GetSensorParamsSchema = z.object({
  id: ObjectIdSchema.describe("Sensor identifier"),
});

/**
 * GET /api/sensors/:id - Get sensor response
 */
export const GetSensorResponseSchema = z.object({
  sensor: SensorWithBuildingSchema,
});

/**
 * PATCH /api/sensors/:id - Update sensor path parameter
 */
export const UpdateSensorParamsSchema = z.object({
  id: ObjectIdSchema.describe("Sensor identifier"),
});

/**
 * PATCH /api/sensors/:id - Update sensor request
 */
export const UpdateSensorRequestSchema = z.object({
  sensorType: SensorTypeSchema.optional(),
  location: z.string().min(1).trim().optional().describe("Physical location"),
  serialNumber: z.string().trim().optional().describe("Sensor serial number"),
  status: SensorStatusSchema.optional(),
  transmissionInterval: z.number().min(10).max(3600).optional().describe("Transmission interval in seconds"),
  minThreshold: z.number().nullable().optional().describe("Minimum threshold for alerts"),
  maxThreshold: z.number().nullable().optional().describe("Maximum threshold for alerts"),
});

/**
 * PATCH /api/sensors/:id - Update sensor response
 */
export const UpdateSensorResponseSchema = z.object({
  success: z.literal(true),
  sensor: SensorSchema,
});

/**
 * DELETE /api/sensors/:id - Delete sensor path parameter
 */
export const DeleteSensorParamsSchema = z.object({
  id: ObjectIdSchema.describe("Sensor identifier"),
});

/**
 * DELETE /api/sensors/:id - Delete sensor response
 */
export const DeleteSensorResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().describe("Confirmation message"),
});

/**
 * SensorReading schema (for historical data)
 */
export const SensorReadingSchema = z.object({
  id: ObjectIdSchema.optional().describe("Reading identifier"),
  timestamp: z.iso.datetime().describe("Reading timestamp"),
  value: z.number().describe("Reading value"),
  unit: z.string().describe("Unit of measurement"),
  metadata: z.object({
    sensorId: ObjectIdSchema,
    buildingId: ObjectIdSchema,
    sensorType: SensorTypeSchema,
  }).optional(),
});

/**
 * POST /api/sensors/:id/readings - Create reading request (for testing/simulation)
 */
export const CreateReadingRequestSchema = z.object({
  value: z.number().describe("Reading value"),
  unit: z.string().min(1).trim().describe("Unit of measurement (e.g., °C, W, kWh)"),
  timestamp: z.iso.datetime().optional().describe("Reading timestamp (defaults to now)"),
});

/**
 * POST /api/sensors/:id/readings - Create reading response
 */
export const CreateReadingResponseSchema = z.object({
  success: z.literal(true),
  reading: SensorReadingSchema,
});

/**
 * GET /api/sensors/:id/readings - Get sensor readings query parameters
 */
export const GetSensorReadingsQuerySchema = PaginationQuerySchema.extend({
  startDate: z.string().datetime().optional().describe("Start date for filtering readings (ISO 8601)"),
  endDate: z.string().datetime().optional().describe("End date for filtering readings (ISO 8601)"),
  sortOrder: SortOrderSchema.optional().describe("Sort order by timestamp (default: desc)"),
});

/**
 * GET /api/sensors/:id/readings - Get sensor readings response
 */
export const GetSensorReadingsResponseSchema = z.object({
  readings: z.array(SensorReadingSchema).describe("List of sensor readings"),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }).describe("Pagination information"),
});

/**
 * GET /api/sensors - List sensors query parameters
 */
export const ListSensorsQuerySchema = PaginationQuerySchema.extend({
  buildingId: ObjectIdSchema.optional().describe("Filter by building ID"),
  sensorType: SensorTypeSchema.optional().describe("Filter by sensor type"),
  status: SensorStatusSchema.optional().describe("Filter by sensor status"),
  sortBy: z
    .enum(["createdAt", "updatedAt", "sensorType", "status"])
    .optional()
    .describe("Field to sort by (default: createdAt)"),
  sortOrder: SortOrderSchema.optional().describe("Sort order (default: desc)"),
});

/**
 * GET /api/sensors - List sensors response
 */
export const ListSensorsResponseSchema = z.object({
  sensors: z.array(SensorWithBuildingSchema).describe("List of sensors"),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }).describe("Pagination information"),
});

// Re-export for convenience
export { ErrorSchema };
