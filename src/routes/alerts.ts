import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Types, type QueryFilter } from "mongoose";
import { Alert as AlertModel, type IAlert } from "../models/Alert";
import {
  ListAlertsQuerySchema,
  ListAlertsResponseSchema,
  AlertIdParamSchema,
  UpdateAlertStatusResponseSchema,
} from "../schemas/alerts";
import { ErrorSchema } from "../schemas/common";
import type { AuthVariables } from "../middleware/auth";

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      tags: ["Alerts"],
      summary: "List alerts",
      description: "Retrieve a paginated list of alerts, optionally filtered.",
      responses: {
        200: {
          description: "List of alerts retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(ListAlertsResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid query parameters",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    validator("query", ListAlertsQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const { 
        limit = 50, 
        offset = 0, 
        buildingId, 
        status, 
        severity, 
        sortBy = "createdAt", 
        sortOrder = "desc" 
      } = query;

      const filter: QueryFilter<IAlert> = {};
      if (buildingId) {
        if (!Types.ObjectId.isValid(buildingId)) {
          return c.json({ error: "Invalid building ID format" }, 400);
        }
        filter.buildingId = buildingId;
      }
      if (status) filter.status = status;
      if (severity) filter.severity = severity;

      const sortDir = sortOrder === "asc" ? 1 : -1;
      const sortConfig: Record<string, 1 | -1> = { [sortBy]: sortDir };

      try {
        const [alerts, total] = await Promise.all([
          AlertModel.find(filter)
            .sort(sortConfig)
            .skip(offset)
            .limit(limit)
            .lean(),
          AlertModel.countDocuments(filter),
        ]);

        return c.json({
          alerts: alerts.map(a => ({
            id: (a._id as Types.ObjectId).toString(),
            buildingId: a.buildingId.toString(),
            buildingName: a.buildingName,
            sensorId: a.sensorId?.toString(),
            type: a.type,
            thresholdType: a.thresholdType,
            severity: a.severity,
            message: a.message,
            status: a.status,
            acknowledgedBy: a.acknowledgedBy,
            acknowledgedAt: a.acknowledgedAt?.toISOString(),
            resolvedBy: a.resolvedBy,
            resolvedAt: a.resolvedAt?.toISOString(),
            createdAt: (a as IAlert).createdAt.toISOString(),
            updatedAt: (a as IAlert).updatedAt.toISOString(),
          })),
          pagination: {
            limit,
            offset,
            total,
          },
        });
      } catch (error) {
        console.error("Error fetching alerts:", error);
        return c.json({ error: "Internal server error" }, 500);
      }
    }
  )
  .patch(
    "/:id/acknowledge",
    describeRoute({
      tags: ["Alerts"],
      summary: "Acknowledge an alert",
      description: "Mark an active alert as acknowledged.",
      responses: {
        200: {
          description: "Alert acknowledged successfully",
          content: { "application/json": { schema: resolver(UpdateAlertStatusResponseSchema) } },
        },
        400: {
          description: "Invalid ID format or alert not active",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        404: {
          description: "Alert not found",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    validator("param", AlertIdParamSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const user = c.get("userDoc");

      if (!Types.ObjectId.isValid(id)) {
        return c.json({ error: "Invalid alert ID format" }, 400);
      }

      try {
        const alert = await AlertModel.findById(id);
        if (!alert) {
          return c.json({ error: "Alert not found" }, 404);
        }

        if (alert.status !== "active") {
          return c.json({ error: "Only active alerts can be acknowledged" }, 400);
        }

        alert.status = "acknowledged";
        alert.acknowledgedBy = user.name || user.email;
        alert.acknowledgedAt = new Date();
        await alert.save();

        return c.json({
          success: true as const,
          alert: {
            id: alert._id.toString(),
            buildingId: alert.buildingId.toString(),
            buildingName: alert.buildingName,
            sensorId: alert.sensorId?.toString(),
            type: alert.type,
            thresholdType: alert.thresholdType,
            severity: alert.severity,
            message: alert.message,
            status: alert.status,
            acknowledgedBy: alert.acknowledgedBy,
            acknowledgedAt: alert.acknowledgedAt?.toISOString(),
            resolvedBy: alert.resolvedBy,
            resolvedAt: alert.resolvedAt?.toISOString(),
            createdAt: alert.createdAt.toISOString(),
            updatedAt: alert.updatedAt.toISOString(),
          }
        });
      } catch (error) {
        console.error("Error acknowledging alert:", error);
        return c.json({ error: "Internal server error" }, 500);
      }
    }
  )
  .patch(
    "/:id/resolve",
    describeRoute({
      tags: ["Alerts"],
      summary: "Resolve an alert",
      description: "Mark an alert as resolved.",
      responses: {
        200: {
          description: "Alert resolved successfully",
          content: { "application/json": { schema: resolver(UpdateAlertStatusResponseSchema) } },
        },
        400: {
          description: "Invalid ID format",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        404: {
          description: "Alert not found",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    validator("param", AlertIdParamSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const user = c.get("userDoc");

      if (!Types.ObjectId.isValid(id)) {
        return c.json({ error: "Invalid alert ID format" }, 400);
      }

      try {
        const alert = await AlertModel.findById(id);
        if (!alert) {
          return c.json({ error: "Alert not found" }, 404);
        }

        if (alert.status === "resolved") {
          return c.json({ error: "Alert is already resolved" }, 400);
        }

        alert.status = "resolved";
        alert.resolvedBy = user.name || user.email;
        alert.resolvedAt = new Date();
        await alert.save();

        return c.json({
          success: true as const,
          alert: {
            id: alert._id.toString(),
            buildingId: alert.buildingId.toString(),
            buildingName: alert.buildingName,
            sensorId: alert.sensorId?.toString(),
            type: alert.type,
            thresholdType: alert.thresholdType,
            severity: alert.severity,
            message: alert.message,
            status: alert.status,
            acknowledgedBy: alert.acknowledgedBy,
            acknowledgedAt: alert.acknowledgedAt?.toISOString(),
            resolvedBy: alert.resolvedBy,
            resolvedAt: alert.resolvedAt?.toISOString(),
            createdAt: alert.createdAt.toISOString(),
            updatedAt: alert.updatedAt.toISOString(),
          }
        });
      } catch (error) {
        console.error("Error resolving alert:", error);
        return c.json({ error: "Internal server error" }, 500);
      }
    }
  );

export default app;
