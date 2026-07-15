import { z } from "zod";
import { ObjectIdSchema, PaginationQuerySchema, SortOrderSchema } from "./common";

export const AlertSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const AlertStatusSchema = z.enum(["active", "acknowledged", "resolved"]);

export const AlertSchema = z.object({
  id: ObjectIdSchema.describe("Unique alert identifier"),
  buildingId: ObjectIdSchema.describe("Building identifier this alert belongs to"),
  buildingName: z.string().describe("Name of the building"),
  sensorId: ObjectIdSchema.optional().describe("Optional sensor identifier this alert relates to"),
  type: z.string().describe("Type of the alert (e.g., temperature_anomaly)"),
  severity: AlertSeveritySchema.describe("Severity level"),
  message: z.string().describe("Description of the alert"),
  status: AlertStatusSchema.describe("Current status"),
  acknowledgedBy: z.string().optional().describe("Name of the user who acknowledged"),
  acknowledgedAt: z.string().datetime().optional().describe("When it was acknowledged"),
  resolvedBy: z.string().optional().describe("Name of the user who resolved"),
  resolvedAt: z.string().datetime().optional().describe("When it was resolved"),
  createdAt: z.string().datetime().describe("Creation timestamp"),
  updatedAt: z.string().datetime().describe("Last update timestamp"),
});

/**
 * GET /api/alerts - List alerts query parameters
 */
export const ListAlertsQuerySchema = PaginationQuerySchema.extend({
  buildingId: ObjectIdSchema.optional().describe("Filter by building ID"),
  status: AlertStatusSchema.optional().describe("Filter by alert status"),
  severity: AlertSeveritySchema.optional().describe("Filter by severity"),
  sortBy: z
    .enum(["createdAt", "updatedAt", "severity", "status"])
    .optional()
    .describe("Field to sort by (default: createdAt)"),
  sortOrder: SortOrderSchema.optional().describe("Sort order (default: desc)"),
});

/**
 * GET /api/alerts - List alerts response
 */
export const ListAlertsResponseSchema = z.object({
  alerts: z.array(AlertSchema).describe("List of alerts"),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }).describe("Pagination information"),
});

/**
 * PATCH /api/alerts/:id/acknowledge
 * PATCH /api/alerts/:id/resolve
 */
export const AlertIdParamSchema = z.object({
  id: ObjectIdSchema.describe("Alert identifier"),
});

export const UpdateAlertStatusResponseSchema = z.object({
  success: z.literal(true),
  alert: AlertSchema,
});
