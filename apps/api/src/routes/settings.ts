import { Hono } from "hono";
import mongoose from "mongoose";
import { describeRoute, resolver, validator } from "hono-openapi";
import { requireRole, type AuthVariables } from "../middleware/auth";
import { SystemConfig } from "../models/SystemConfig";
import { serializeConfig } from "../lib/settings";
import {
  GetSettingsResponseSchema,
  UpdateSettingsRequestSchema,
  UpdateSettingsResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  GetSettingsResponse,
  UpdateSettingsResponse,
  ErrorResponse,
} from "@wattguard/shared";
import { apiError, apiSuccess } from "../lib/api-response";

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      summary: "Leggi configurazione",
      description: "Restituisce la configurazione di sistema corrente",
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
          description: "Forbidden – requires admin or operator role",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    async (c) => {
      const config = await SystemConfig.getOrCreate();
      return c.json(apiSuccess(serializeConfig(config)) satisfies GetSettingsResponse);
    },
  )
  .patch(
    "/",
    requireRole("admin"),
    describeRoute({
      summary: "Aggiorna configurazione",
      description: "Aggiorna polling, notifiche e retention (solo admin)",
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
          description: "Forbidden - requires admin role",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    validator("json", UpdateSettingsRequestSchema),
    async (c) => {
      const body = c.req.valid("json");

      // Build a MongoDB $set object with only the provided fields
      const $set: Record<string, string | number | boolean> = {};

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
        return c.json(
          apiError("settings_update_failed", "Failed to update configuration") satisfies ErrorResponse,
          500,
        );
      }

      // Update MongoDB TTL on time-series sensorreadings collection directly
      if (body.database?.dataRetentionDays !== undefined) {
        const seconds = body.database.dataRetentionDays * 86400;
        const db = mongoose.connection.db;
        if (db) {
          try {
            await db.command({
              collMod: "sensorreadings",
              expireAfterSeconds: seconds,
            });
          } catch {
            return c.json(
              apiError("ttl_update_failed", "Failed to update sensorreadings TTL") satisfies ErrorResponse,
              500,
            );
          }
        }
      }

      return c.json(apiSuccess(serializeConfig(updated)) satisfies UpdateSettingsResponse);
    },
  );

export default app;
export type AppType = typeof app;
