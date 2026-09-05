/**
 * Settings route schemas
 *
 * Routes: /api/v1/settings (GET, PATCH), /api/v1/settings/export (GET), /api/v1/settings/backup (POST)
 */
import { z } from "zod";

// ── Sub-schemas ──────────────────────────────────────────────────────────────

export const PollingConfigSchema = z.object({
  intervalSeconds: z
    .number()
    .int()
    .min(10)
    .max(3600)
    .describe("Frontend refetch interval in seconds for the realtime widget"),
  autoPollingEnabled: z
    .boolean()
    .describe("Whether automatic polling is enabled"),
}).meta({ id: "PollingConfig" });

export type PollingConfig = z.infer<typeof PollingConfigSchema>;

export const NotificationsConfigSchema = z.object({
  emailEnabled: z.boolean().describe("Whether email notifications are enabled"),
}).meta({ id: "NotificationsConfig" });

export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;

export const DatabaseConfigSchema = z.object({
  dataRetentionDays: z
    .number()
    .int()
    .min(1)
    .describe("Number of days to retain historical sensor readings"),
}).meta({ id: "DatabaseConfig" });

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

// ── Full config schema (used for GET response) ───────────────────────────────

export const SystemConfigSchema = z.object({
  polling: PollingConfigSchema,
  notifications: NotificationsConfigSchema,
  database: DatabaseConfigSchema,
}).meta({ id: "SystemConfig" });

export type SystemConfig = z.infer<typeof SystemConfigSchema>;

export const GetSettingsResponseSchema = z.object({
  success: z.literal(true),
  data: SystemConfigSchema,
}).meta({ id: "GetSettingsResponse" });

export type GetSettingsResponse = z.infer<typeof GetSettingsResponseSchema>;

// ── Update schema (used for PATCH request — all fields optional) ─────────────

export const UpdateSettingsRequestSchema = z
  .object({
    polling: PollingConfigSchema.partial().optional(),
    notifications: NotificationsConfigSchema.partial().optional(),
    database: DatabaseConfigSchema.partial().optional(),
  })
  .refine(
    (data) =>
      Object.values(data).some(
        (v) => v !== undefined && Object.keys(v).length > 0,
      ),
    { message: "At least one setting must be provided" },
  ).meta({ id: "UpdateSettingsRequest" });

export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;

export const UpdateSettingsResponseSchema = z.object({
  success: z.literal(true),
  data: SystemConfigSchema,
}).meta({ id: "UpdateSettingsResponse" });

export type UpdateSettingsResponse = z.infer<typeof UpdateSettingsResponseSchema>;
