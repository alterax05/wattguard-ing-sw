import { z } from "zod";
import { 
  ObjectIdSchema, 
  IsoDateTimeSchema,
  SensorTypeSchema, 
  SensorStatusSchema,
  PaginationQuerySchema,
  PaginationResponseSchema,
  ObjectIdParamSchema,
  SortOrderSchema,
} from "./common";

/**
 * LastReading schema
 */
export const LastReadingSchema = z.object({
  value: z.number().describe("Reading value"),
  timestamp: IsoDateTimeSchema.describe("Timestamp of the reading"),
  unit: z.string().describe("Unit of measurement (e.g., °C, W, kWh)"),
});

export type LastReading = z.infer<typeof LastReadingSchema>;

/**
 * Populated building summary inside sensor
 */
export const PopulatedBuildingSchema = z.object({
  _id: ObjectIdSchema.describe("Building identifier"),
  name: z.string().describe("Building name"),
  address: z.string().describe("Building address"),
});

export type PopulatedBuilding = z.infer<typeof PopulatedBuildingSchema>;

/**
 * Sensor response schema
 */
export const SensorSchema = z.object({
  _id: ObjectIdSchema.describe("Unique sensor identifier"),
  building: z
    .union([
      ObjectIdSchema.describe("Building identifier"),
      PopulatedBuildingSchema.describe("Populated building details"),
    ])
    .describe("Building reference (ObjectId or populated object)"),
  sensorType: SensorTypeSchema,
  location: z.string().describe("Physical location of the sensor in the building"),
  serialNumber: z.string().nullish().transform((v) => v ?? undefined).describe("Optional sensor serial number"),
  installationDate: IsoDateTimeSchema.describe("Date when sensor was installed"),
  status: SensorStatusSchema,
  lastReading: LastReadingSchema.optional().describe("Most recent reading (denormalized for performance)"),
  transmissionInterval: z.number().describe("Data transmission interval in seconds (default: 90)"),
  minThreshold: z.number().nullish().transform((v) => v ?? undefined).describe("Minimum threshold for alerts"),
  maxThreshold: z.number().nullish().transform((v) => v ?? undefined).describe("Maximum threshold for alerts"),
  createdBy: ObjectIdSchema.optional().describe("User who created this sensor"),
  updatedBy: ObjectIdSchema.optional().describe("User who last updated this sensor"),
  createdAt: IsoDateTimeSchema.optional().describe("Creation timestamp"),
  updatedAt: IsoDateTimeSchema.optional().describe("Last update timestamp"),
});

export type Sensor = z.infer<typeof SensorSchema>;

/**
 * Base create sensor input schema
 */
export const CreateSensorInputSchema = z.object({
  building: ObjectIdSchema.describe("Building identifier"),
  sensorType: SensorTypeSchema,
  location: z.string().min(1, "Location is required").trim().describe("Physical location in the building"),
  serialNumber: z.string().trim().optional().describe("Optional sensor serial number"),
  installationDate: IsoDateTimeSchema.optional().describe("Date when sensor was installed (defaults to now)"),
  transmissionInterval: z.number().min(10).max(3600).optional().describe("Transmission interval in seconds (default: 90)"),
  minThreshold: z.number().optional().describe("Minimum threshold for alerts"),
  maxThreshold: z.number().optional().describe("Maximum threshold for alerts"),
});

/**
 * POST /api/v1/sensors - Create sensor request
 */
export const CreateSensorRequestSchema = CreateSensorInputSchema;

export type CreateSensorRequest = z.infer<typeof CreateSensorRequestSchema>;

/**
 * POST /api/v1/sensors - Create sensor response
 */
export const CreateSensorResponseSchema = z.object({
  success: z.literal(true),
  data: SensorSchema,
});

export type CreateSensorResponse = z.infer<typeof CreateSensorResponseSchema>;

/**
 * GET /api/v1/sensors/:id - Get sensor path parameter
 */
export const GetSensorParamsSchema = ObjectIdParamSchema;

/**
 * GET /api/v1/sensors/:id - Get sensor response
 */
export const GetSensorResponseSchema = z.object({
  success: z.literal(true),
  data: SensorSchema,
});

export type GetSensorResponse = z.infer<typeof GetSensorResponseSchema>;

/**
 * PATCH /api/v1/sensors/:id - Update sensor path parameter
 */
export const UpdateSensorParamsSchema = ObjectIdParamSchema;

/**
 * PATCH /api/v1/sensors/:id - Update sensor request
 */
export const UpdateSensorRequestSchema = CreateSensorInputSchema.omit({
  building: true,
  installationDate: true,
}).partial().extend({
  minThreshold: z.number().nullable().optional().describe("Minimum threshold for alerts"),
  maxThreshold: z.number().nullable().optional().describe("Maximum threshold for alerts"),
  status: SensorStatusSchema.optional(),
});

export type UpdateSensorRequest = z.infer<typeof UpdateSensorRequestSchema>;

/**
 * PATCH /api/v1/sensors/:id - Update sensor response
 */
export const UpdateSensorResponseSchema = z.object({
  success: z.literal(true),
  data: SensorSchema,
});

export type UpdateSensorResponse = z.infer<typeof UpdateSensorResponseSchema>;

/**
 * DELETE /api/v1/sensors/:id - Delete sensor path parameter
 */
export const DeleteSensorParamsSchema = ObjectIdParamSchema;

/**
 * DELETE /api/v1/sensors/:id - Delete sensor response
 */
export const DeleteSensorResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().describe("Deleted sensor identifier"),
    message: z.string().optional().describe("Deletion message"),
  }),
});

export type DeleteSensorResponse = z.infer<typeof DeleteSensorResponseSchema>;

/**
 * SensorReading schema (for historical data)
 */
export const SensorReadingSchema = z.object({
  _id: ObjectIdSchema.optional().describe("Reading identifier"),
  timestamp: IsoDateTimeSchema.describe("Reading timestamp"),
  value: z.number().describe("Reading value"),
  unit: z.string().describe("Unit of measurement"),
  metadata: z.object({
    sensor: ObjectIdSchema,
    building: ObjectIdSchema.optional(),
    sensorType: SensorTypeSchema,
  }).optional(),
});

export type SensorReading = z.infer<typeof SensorReadingSchema>;

/**
 * POST /api/v1/sensors/:id/readings - Create reading request (for testing/simulation)
 */
export const CreateReadingRequestSchema = z.object({
  value: z.number().describe("Reading value"),
  unit: z.string().min(1).trim().describe("Unit of measurement (e.g., °C, W, kWh)"),
  timestamp: IsoDateTimeSchema.optional().describe("Reading timestamp (defaults to now)"),
});

export type CreateReadingRequest = z.infer<typeof CreateReadingRequestSchema>;

/**
 * POST /api/v1/sensors/:id/readings - Create reading response
 */
export const CreateReadingResponseSchema = z.object({
  success: z.literal(true),
  reading: SensorReadingSchema,
});

export type CreateReadingResponse = z.infer<typeof CreateReadingResponseSchema>;

/**
 * GET /api/v1/sensors/:id/readings - Get sensor readings query parameters
 */
export const GetSensorReadingsQuerySchema = PaginationQuerySchema.extend({
  startDate: z.iso.datetime().optional().describe("Start date for filtering readings (ISO 8601)"),
  endDate: z.iso.datetime().optional().describe("End date for filtering readings (ISO 8601)"),
  sortOrder: SortOrderSchema.optional().describe("Sort order by timestamp (default: desc)"),
});

export type GetSensorReadingsQuery = z.input<typeof GetSensorReadingsQuerySchema>;

/**
 * GET /api/v1/sensors/:id/readings - Get sensor readings response
 */
export const GetSensorReadingsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    readings: z.array(SensorReadingSchema).describe("List of sensor readings"),
    pagination: PaginationResponseSchema,
  }),
});

export type GetSensorReadingsResponse = z.infer<typeof GetSensorReadingsResponseSchema>;

/**
 * GET /api/v1/sensors - List sensors query parameters
 */
export const ListSensorsQuerySchema = PaginationQuerySchema.extend({
  building: ObjectIdSchema.optional().describe("Filter by building ID"),
  sensorType: SensorTypeSchema.optional().describe("Filter by sensor type"),
  status: SensorStatusSchema.optional().describe("Filter by sensor status"),
  sortBy: z
    .enum(["createdAt", "updatedAt", "sensorType", "status"])
    .optional()
    .describe("Field to sort by (default: createdAt)"),
  sortOrder: SortOrderSchema.optional().describe("Sort order (default: desc)"),
});

export type ListSensorsQuery = z.input<typeof ListSensorsQuerySchema>;

/**
 * GET /api/v1/sensors - List sensors response
 */
export const ListSensorsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    sensors: z.array(SensorSchema).describe("List of sensors"),
    pagination: PaginationResponseSchema,
  }),
});

export type ListSensorsResponse = z.infer<typeof ListSensorsResponseSchema>;
