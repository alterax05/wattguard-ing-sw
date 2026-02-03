import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { QueryFilter } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { AuditLog, type IAuditLog } from "../models/AuditLog";
import {
  AuditEntityTypeSchema,
  AuditActionSchema,
  PaginationQuerySchema,
} from "../schemas/common";

const app = new Hono<{ Variables: AuthVariables }>();

// GET /api/audit-logs - List all audit logs with filters (admin only)
app.get(
  "/",
  describeRoute({
    tags: ["Audit Logs"],
    summary: "List audit logs",
    description:
      "List all audit logs with optional filters. Supports pagination. Admin only.",
    responses: {
      200: {
        description: "List of audit logs",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                logs: z.array(
                  z.object({
                    _id: z.string(),
                    entityType: AuditEntityTypeSchema,
                    entityId: z.string(),
                    action: AuditActionSchema,
                    performedBy: z.string(),
                    changes: z.record(z.string(), z.unknown()).optional(),
                    timestamp: z.string(),
                  }),
                ),
                total: z.number(),
                page: z.number(),
                limit: z.number(),
                totalPages: z.number(),
              }),
            ),
          },
        },
      },
      401: {
        description: "Unauthorized - Invalid or missing JWT token",
      },
      403: {
        description: "Forbidden - Admin role required",
      },
    },
  }),
  validator(
    "query",
    PaginationQuerySchema.extend({
      page: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : undefined))
        .pipe(z.number().min(1).optional()),
      entityType: AuditEntityTypeSchema.optional(),
      action: AuditActionSchema.optional(),
      performedBy: z.string().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }),
  ),
  async (c) => {
    const {
      offset = 0,
      limit = 50,
      page,
      entityType,
      action,
      performedBy,
      startDate,
      endDate,
    } = c.req.valid("query");

    // Build filter query
    const filter: QueryFilter<IAuditLog> = {};

    if (entityType) {
      filter.entityType = entityType;
    }

    if (action) {
      filter.action = action;
    }

    if (performedBy) {
      filter.performedBy = performedBy;
    }

    // Date range filter
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.timestamp.$lte = new Date(endDate);
      }
    }

    // If page is provided, use it to calculate skip; otherwise use offset
    const currentPage = page ?? Math.floor(offset / limit) + 1;
    const skip = page ? (page - 1) * limit : offset;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return c.json({
      logs: logs.map((log) => ({
        _id: log._id.toString(),
        entityType: log.entityType,
        entityId: log.entityId.toString(),
        action: log.action,
        performedBy: log.performedBy.toString(),
        changes: log.changes,
        timestamp: log.timestamp.toISOString(),
      })),
      total,
      page: currentPage,
      limit,
      totalPages,
    });
  },
);

// GET /api/audit-logs/:entityType/:entityId - Get audit logs for a specific entity
app.get(
  "/:entityType/:entityId",
  describeRoute({
    tags: ["Audit Logs"],
    summary: "Get audit logs for specific entity",
    description:
      "Get all audit logs for a specific entity (building, sensor, etc.). Admin only.",
    responses: {
      200: {
        description: "List of audit logs for the entity",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                logs: z.array(
                  z.object({
                    _id: z.string(),
                    entityType: AuditEntityTypeSchema,
                    entityId: z.string(),
                    action: AuditActionSchema,
                    performedBy: z.string(),
                    changes: z.record(z.string(), z.unknown()).optional(),
                    timestamp: z.string(),
                  }),
                ),
                total: z.number(),
              }),
            ),
          },
        },
      },
      401: {
        description: "Unauthorized - Invalid or missing JWT token",
      },
      403: {
        description: "Forbidden - Admin role required",
      },
      404: {
        description: "No audit logs found for this entity",
      },
    },
  }),
  validator(
    "param",
    z.object({
      entityType: AuditEntityTypeSchema,
      entityId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId"),
    }),
  ),
  async (c) => {
    const { entityType, entityId } = c.req.valid("param");

    const logs = await AuditLog.find({
      entityType,
      entityId,
    })
      .sort({ timestamp: -1 })
      .lean();

    if (logs.length === 0) {
      return c.json({ error: "No audit logs found for this entity" }, 404);
    }

    return c.json({
      logs: logs.map((log) => ({
        _id: log._id.toString(),
        entityType: log.entityType,
        entityId: log.entityId.toString(),
        action: log.action,
        performedBy: log.performedBy.toString(),
        changes: log.changes,
        timestamp: log.timestamp.toISOString(),
      })),
      total: logs.length,
    });
  },
);

export default app;
