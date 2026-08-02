/**
 * Settings routes
 *
 * All routes in this file are protected by JWT authentication and admin role
 * requirement, applied globally in src/index.ts
 *
 * GET  /api/settings         - Get current system configuration
 * PATCH /api/settings        - Update system configuration
 * GET  /api/settings/export  - Download all sensor readings as JSON
 * POST /api/settings/backup  - Download a full database backup as JSON
 */
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AuthVariables } from "../middleware/auth";
import { SystemConfig } from "../models/SystemConfig";
import { SensorReading } from "../models/SensorReading";
import { Building } from "../models/Building";
import { Sensor } from "../models/Sensor";
import { Alert } from "../models/Alert";
import { User } from "../models/User";
import {
  GetSettingsResponseSchema,
  UpdateSettingsRequestSchema,
  UpdateSettingsResponseSchema,
  ErrorSchema,
} from "../schemas/settings";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Serialize a SystemConfig document to a plain object for API responses. */
function serializeConfig(doc: Awaited<ReturnType<typeof SystemConfig.getOrCreate>>) {
  return {
    polling: {
      intervalSeconds: doc.polling.intervalSeconds,
      autoPollingEnabled: doc.polling.autoPollingEnabled,
    },
    notifications: {
      emailEnabled: doc.notifications.emailEnabled,
    },
    database: {
      dataRetentionDays: doc.database.dataRetentionDays,
    },
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

const app = new Hono<{ Variables: AuthVariables }>()
  // ── GET /api/settings ──────────────────────────────────────────────────────
  .get(
    "/",
    describeRoute({
      description: "Get the current system configuration (admin only)",
      tags: ["Settings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "System configuration retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(GetSettingsResponseSchema),
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        403: {
          description: "Forbidden – requires admin role",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    async (c) => {
      const config = await SystemConfig.getOrCreate();
      return c.json({ config: serializeConfig(config) });
    },
  )

  // ── PATCH /api/settings ────────────────────────────────────────────────────
  .patch(
    "/",
    describeRoute({
      description: "Update the system configuration (admin only)",
      tags: ["Settings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "System configuration updated successfully",
          content: {
            "application/json": {
              schema: resolver(UpdateSettingsResponseSchema),
            },
          },
        },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        401: {
          description: "Unauthorized",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        403: {
          description: "Forbidden – requires admin role",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    validator("json", UpdateSettingsRequestSchema),
    async (c) => {
      const body = c.req.valid("json");

      // Build a MongoDB $set object with only the provided fields
      const $set: Record<string, unknown> = {};

      if (body.polling) {
        if (body.polling.intervalSeconds !== undefined)
          $set["polling.intervalSeconds"] = body.polling.intervalSeconds;
        if (body.polling.autoPollingEnabled !== undefined)
          $set["polling.autoPollingEnabled"] = body.polling.autoPollingEnabled;
      }

      if (body.notifications) {
        if (body.notifications.emailEnabled !== undefined)
          $set["notifications.emailEnabled"] = body.notifications.emailEnabled;
      }

      if (body.database) {
        if (body.database.dataRetentionDays !== undefined)
          $set["database.dataRetentionDays"] = body.database.dataRetentionDays;
      }

      const updated = await SystemConfig.findOneAndUpdate(
        {},
        { $set },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );

      if (!updated) {
        return c.json({ error: "Failed to update configuration" }, 500);
      }

      return c.json({ success: true as const, config: serializeConfig(updated) });
    },
  )

  // ── GET /api/settings/export ───────────────────────────────────────────────
  .get(
    "/export",
    describeRoute({
      description:
        "Download all sensor readings as a JSON file (admin only)",
      tags: ["Settings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "JSON file download",
          content: { "application/json": { schema: { type: "object" } } },
        },
        401: {
          description: "Unauthorized",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        403: {
          description: "Forbidden – requires admin role",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    async (c) => {
      // Fetch all readings (no limit — export is intentionally exhaustive)
      const readings = await SensorReading.find()
        .sort({ timestamp: -1 })
        .lean();

      const exportData = {
        exportedAt: new Date().toISOString(),
        totalRecords: readings.length,
        readings: readings.map((r) => ({
          id: r._id?.toString(),
          timestamp: r.timestamp,
          value: r.value,
          unit: r.unit,
          sensorId: r.metadata.sensorId?.toString(),
          buildingId: r.metadata.buildingId?.toString(),
          sensorType: r.metadata.sensorType,
        })),
      };

      const filename = `wattguard-readings-${new Date().toISOString().slice(0, 10)}.json`;

      c.header("Content-Type", "application/json");
      c.header("Content-Disposition", `attachment; filename="${filename}"`);

      return c.body(JSON.stringify(exportData, null, 2));
    },
  )

  // ── POST /api/settings/backup ──────────────────────────────────────────────
  .post(
    "/backup",
    describeRoute({
      description:
        "Download a full database backup as a JSON file (admin only)",
      tags: ["Settings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "JSON backup file download",
          content: { "application/json": { schema: { type: "object" } } },
        },
        401: {
          description: "Unauthorized",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        403: {
          description: "Forbidden – requires admin role",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    async (c) => {
      // Fetch all collections in parallel (exclude password hashes from users)
      const [buildings, sensors, alerts, users, config] = await Promise.all([
        Building.find().lean(),
        Sensor.find().lean(),
        Alert.find().lean(),
        User.find().select("-passwordHash -googleSub").lean(),
        SystemConfig.getOrCreate(),
      ]);

      const backup = {
        backupAt: new Date().toISOString(),
        version: "1.0",
        collections: {
          buildings,
          sensors,
          alerts,
          users,
          systemConfig: serializeConfig(config),
        },
      };

      const filename = `wattguard-backup-${new Date().toISOString().slice(0, 10)}.json`;

      c.header("Content-Type", "application/json");
      c.header("Content-Disposition", `attachment; filename="${filename}"`);

      return c.body(JSON.stringify(backup, null, 2));
    },
  );

export default app;
export type AppType = typeof app;
