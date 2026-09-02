/**
 * Dashboard aggregate schemas
 *
 * Schemas for the dashboard stats and history endpoints.
 */

import { z } from "zod";

// ── Query Schemas ────────────────────────────────────────────────────────────

/**
 * Query params for GET /api/v1/dashboard/history
 */
export const DashboardHistoryQuerySchema = z.object({
  startDate: z.iso.datetime({ offset: true }).or(z.string().date()).describe("Start of the time range (ISO 8601)"),
  endDate: z.iso.datetime({ offset: true }).or(z.string().date()).describe("End of the time range (ISO 8601)"),
  interval: z
    .enum(["hour", "day", "week"])
    .optional()
    .default("day")
    .describe("Bucket interval for aggregation (default: day)"),
});

export type DashboardHistoryQuery = z.input<typeof DashboardHistoryQuerySchema>;

// ── Response Schemas ─────────────────────────────────────────────────────────

/**
 * Response for GET /api/v1/dashboard/stats
 */
export const DashboardStatsResponseSchema = z.object({
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

export type DashboardStatsResponse = z.infer<typeof DashboardStatsResponseSchema>;
export type DashboardStats = DashboardStatsResponse;

/**
 * A single data point in the history response
 */
export const DashboardHistoryDataPointSchema = z.object({
  date: z.string().describe("Bucket label (ISO date or hour string)"),
  electricity: z.number().nullable().describe("Average energy_meter reading for the bucket (kWh)"),
  gas: z.number().nullable().describe("Average gas_meter reading for the bucket (m³)"),
});

export type DashboardHistoryDataPoint = z.infer<typeof DashboardHistoryDataPointSchema>;

/**
 * Response for GET /api/v1/dashboard/history
 */
export const DashboardHistoryResponseSchema = z.object({
  period: z.object({
    startDate: z.string(),
    endDate: z.string(),
    interval: z.enum(["hour", "day", "week"]),
  }),
  data: z.array(DashboardHistoryDataPointSchema),
});

export type DashboardHistoryResponse = z.infer<typeof DashboardHistoryResponseSchema>;
export type DashboardHistory = DashboardHistoryResponse;
