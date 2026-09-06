import { z } from "zod";
import {
  IsoDateTimeSchema,
  ObjectIdSchema,
  PaginationQuerySchema,
  PaginationResponseSchema,
  SensorTypeSchema,
  SortOrderSchema,
  SelfLinkSchema,
} from "./common";
import { PopulatedBuildingSchema } from "./sensors";

export const AlertSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertStatusSchema = z.enum(["active", "acknowledged", "resolved"]);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

export const AlertThresholdTypeSchema = z.enum(["min", "max"]);
export type AlertThresholdType = z.infer<typeof AlertThresholdTypeSchema>;

export const THRESHOLD_ALERT_TYPE = "threshold_exceeded";
export const EFFICIENCY_ALERT_TYPE = "efficiency_below_threshold";
export const ALERT_TYPES = [THRESHOLD_ALERT_TYPE, EFFICIENCY_ALERT_TYPE] as const;
export type AlertType = (typeof ALERT_TYPES)[number];
export const AlertTypeSchema = z.enum(ALERT_TYPES);

export const PopulatedAlertSensorSchema = z.object({
  self: SelfLinkSchema.optional(),
  _id: ObjectIdSchema.describe("Sensor identifier"),
  sensorType: SensorTypeSchema.describe("Type of the sensor"),
  location: z.string().describe("Physical location of the sensor in the building"),
}).meta({ id: "PopulatedAlertSensor" });

export type PopulatedAlertSensor = z.infer<typeof PopulatedAlertSensorSchema>;

export const AlertSchema = z.object({
  self: SelfLinkSchema.optional(),
  id: ObjectIdSchema.describe("Unique alert identifier"),
  building: z
    .union([
      ObjectIdSchema.describe("Building identifier"),
      PopulatedBuildingSchema.describe("Populated building details"),
    ])
    .describe("Building reference (ObjectId or populated object)"),
  sensor: z
    .union([
      ObjectIdSchema.describe("Sensor identifier"),
      PopulatedAlertSensorSchema.describe("Populated sensor details"),
    ])
    .optional()
    .describe("Sensor reference (ObjectId or populated object)"),
  type: AlertTypeSchema.describe("Type of the alert"),
  thresholdType: AlertThresholdTypeSchema.nullish().transform((v) => v ?? undefined).describe("Threshold direction for threshold alerts"),
  severity: AlertSeveritySchema.describe("Severity level"),
  value: z.number().nullish().transform((v) => v ?? undefined).describe("Measured value that triggered the alert"),
  unit: z.string().nullish().transform((v) => v ?? undefined).describe("Unit of the measured value"),
  limit: z.number().nullish().transform((v) => v ?? undefined).describe("Threshold limit that was exceeded"),
  status: AlertStatusSchema.describe("Current status"),
  acknowledgedBy: z.string().nullish().transform((v) => v ?? undefined).describe("Name of the user who acknowledged"),
  acknowledgedAt: IsoDateTimeSchema.nullish().transform((v) => v ?? undefined).describe("When it was acknowledged"),
  resolvedBy: z.string().nullish().transform((v) => v ?? undefined).describe("Name of the user who resolved"),
  resolvedAt: IsoDateTimeSchema.nullish().transform((v) => v ?? undefined).describe("When it was resolved"),
  createdAt: IsoDateTimeSchema.describe("Creation timestamp"),
  updatedAt: IsoDateTimeSchema.describe("Last update timestamp"),
}).meta({ id: "Alert" });

export type Alert = z.infer<typeof AlertSchema>;

/**
 * GET /api/alerts - List alerts query parameters
 */
export const ListAlertsQuerySchema = PaginationQuerySchema.extend({
  building: ObjectIdSchema.optional().describe("Filter by building ID"),
  status: AlertStatusSchema.optional().describe("Filter by alert status"),
  severity: AlertSeveritySchema.optional().describe("Filter by severity"),
  sortBy: z
    .enum(["createdAt", "updatedAt", "severity", "status"])
    .optional()
    .describe("Field to sort by (default: createdAt)"),
  sortOrder: SortOrderSchema.optional().describe("Sort order (default: desc)"),
});

export type ListAlertsQuery = z.input<typeof ListAlertsQuerySchema>;

/**
 * GET /api/alerts - List alerts response
 */
export const ListAlertsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    alerts: z.array(AlertSchema).describe("List of alerts"),
    pagination: PaginationResponseSchema,
  }),
}).meta({ id: "ListAlertsResponse" });

export type ListAlertsResponse = z.infer<typeof ListAlertsResponseSchema>;

/**
 * PATCH /api/alerts/:id/acknowledge
 * PATCH /api/alerts/:id/resolve
 */
export const AlertIdParamSchema = z.object({
  id: ObjectIdSchema.describe("Alert identifier"),
});

export const UpdateAlertStatusRequestSchema = z.object({
  status: z.enum(["acknowledged", "resolved"]).describe("New status for the alert"),
}).meta({ id: "UpdateAlertStatusRequest" });

export type UpdateAlertStatusRequest = z.infer<typeof UpdateAlertStatusRequestSchema>;

/**
 * PATCH /api/alerts/:id - Update alert status response
 * GET /api/v1/alerts/:id - Get alert by ID response
 */
export const AlertResponseSchema = z.object({
  success: z.literal(true),
  data: AlertSchema,
}).meta({ id: "AlertResponse" });

export type AlertResponse = z.infer<typeof AlertResponseSchema>;

/**
 * GET /api/v1/alerts/:id - Get alert by ID
 */
export const GetAlertParamsSchema = AlertIdParamSchema;
export type GetAlertParams = z.infer<typeof GetAlertParamsSchema>;




