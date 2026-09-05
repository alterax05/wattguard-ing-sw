/**
 * System-wide metrics and KPIs schemas
 *
 * Routes: /api/v1/metrics, /api/v1/metrics/timeseries
 */

import { z } from "zod";

// ── Query Schemas ────────────────────────────────────────────────────────────

/**
 * Query params for GET /api/v1/metrics/timeseries
 */
export const MetricsHistoryQuerySchema = z.object({
  startDate: z.iso.datetime({ offset: true }).or(z.string().date()).describe("Start of the time range (ISO 8601)"),
  endDate: z.iso.datetime({ offset: true }).or(z.string().date()).describe("End of the time range (ISO 8601)"),
  interval: z
    .enum(["hour", "day", "week"])
    .optional()
    .default("day")
    .describe("Bucket interval for aggregation (default: day)"),
});

export type MetricsHistoryQuery = z.input<typeof MetricsHistoryQuerySchema>;

// ── System Metrics / KPI Schemas ─────────────────────────────────────────────

export const SystemMetricsSchema = z.object({
  sensors: z.object({
    active: z.number().describe("Total active sensors across all buildings"),
    total: z.number().describe("Total sensors across all buildings"),
  }),
  alerts: z.object({
    active: z.number().describe("Total active alerts"),
  }),
  consumption: z.object({
    electricity: z.number().nullable().describe("Sum of current energy_meter readings (kWh)"),
    gas: z.number().nullable().describe("Sum of current gas_meter readings (m³)"),
  }),
});

export type SystemMetrics = z.infer<typeof SystemMetricsSchema>;

/**
 * Response for GET /api/v1/metrics
 */
export const MetricsResponseSchema = z.object({
  success: z.literal(true),
  data: SystemMetricsSchema,
});

export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;

// ── History Schemas ──────────────────────────────────────────────────────────

/**
 * A single data point in the history response
 */
export const MetricsHistoryDataPointSchema = z.object({
  date: z.string().describe("Bucket label (ISO date or hour string)"),
  electricity: z.number().nullable().describe("Average energy_meter reading for the bucket (kWh)"),
  gas: z.number().nullable().describe("Average gas_meter reading for the bucket (m³)"),
});

export type MetricsHistoryDataPoint = z.infer<typeof MetricsHistoryDataPointSchema>;

/**
 * Data payload for GET /api/v1/metrics/timeseries
 */
export const MetricsHistoryDataSchema = z.object({
  period: z.object({
    startDate: z.string(),
    endDate: z.string(),
    interval: z.enum(["hour", "day", "week"]),
  }),
  data: z.array(MetricsHistoryDataPointSchema),
});

export type MetricsHistoryData = z.infer<typeof MetricsHistoryDataSchema>;

/**
 * Response for GET /api/v1/metrics/timeseries
 */
export const MetricsHistoryResponseSchema = z.object({
  success: z.literal(true),
  data: MetricsHistoryDataSchema,
});

export type MetricsHistoryResponse = z.infer<typeof MetricsHistoryResponseSchema>;
