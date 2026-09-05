import { ExportReportQuerySchema, type ExportReportQuery } from "./export";

/**
 * GET /api/v1/reports - Aggregated energy report query parameters
 */
export const ReportsQuerySchema = ExportReportQuerySchema;
export type ReportsQuery = ExportReportQuery;
