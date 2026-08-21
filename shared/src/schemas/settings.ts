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
});



export const NotificationsConfigSchema = z.object({
  emailEnabled: z.boolean().describe("Whether email notifications are enabled"),
});

export const DatabaseConfigSchema = z.object({
  dataRetentionDays: z
    .number()
    .int()
    .min(1)
    .describe("Number of days to retain historical sensor readings"),
});

// ── Full config schema (used for GET response) ───────────────────────────────

export const SystemConfigSchema = z.object({
  polling: PollingConfigSchema,
  notifications: NotificationsConfigSchema,
  database: DatabaseConfigSchema,
});

export const GetSettingsResponseSchema = z.object({
  config: SystemConfigSchema,
});

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
  );

export const UpdateSettingsResponseSchema = z.object({
  success: z.literal(true),
  config: SystemConfigSchema,
});

export type UpdateSettingsResponse = z.infer<typeof UpdateSettingsResponseSchema>;
