import { z } from "zod";
import {
  DashboardStatsResponseSchema,
  DashboardHistoryQuerySchema,
  DashboardHistoryResponseSchema,
  DashboardHistoryDataPointSchema,
} from "./dashboard";

/**
 * GET /api/v1/metrics - System metrics and KPIs
 */
export const MetricsResponseSchema = DashboardStatsResponseSchema;
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;

/**
 * GET /api/v1/metrics/history - Aggregated metrics query params
 */
export const MetricsHistoryQuerySchema = DashboardHistoryQuerySchema;
export type MetricsHistoryQuery = z.input<typeof MetricsHistoryQuerySchema>;

/**
 * GET /api/v1/metrics/history - Aggregated metrics response
 */
export const MetricsHistoryResponseSchema = DashboardHistoryResponseSchema;
export type MetricsHistoryResponse = z.infer<typeof MetricsHistoryResponseSchema>;

export const MetricsHistoryDataPointSchema = DashboardHistoryDataPointSchema;
export type MetricsHistoryDataPoint = z.infer<typeof MetricsHistoryDataPointSchema>;
