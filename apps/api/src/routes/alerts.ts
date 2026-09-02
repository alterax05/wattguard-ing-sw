import { Hono, type Context } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Types, type QueryFilter } from "mongoose";
import { Alert as AlertModel, type AlertDocument } from "../models/Alert";
import {
  ListAlertsQuerySchema,
  ListAlertsResponseSchema,
  AlertIdParamSchema,
  UpdateAlertStatusResponseSchema,
} from "@wattguard/shared";
import type {
  ListAlertsResponse,
  UpdateAlertStatusResponse,
} from "@wattguard/shared";
import { ErrorSchema } from "@wattguard/shared";
import type { AuthVariables } from "../middleware/auth";
import {
  acknowledge,
  resolveManually,
  toAlertDTO,
  type AlertDTOInput,
  type AlertErrorCode,
} from "../lib/alerts";
import { getRequestLocale } from "../lib/i18n";

type AlertRouteContext = Context<{ Variables: AuthVariables }>;

function alertErrorResponse(c: AlertRouteContext, code: AlertErrorCode) {
  switch (code) {
    case "invalid_alert_id":
      return c.json({ error: "Invalid alert ID format", code }, 400);
    case "alert_not_found":
      return c.json({ error: "Alert not found", code }, 404);
    case "alert_not_active":
      return c.json(
        { error: "Only active alerts can be acknowledged", code },
        400,
      );
    case "alert_already_resolved":
      return c.json({ error: "Alert is already resolved", code }, 400);
    case "internal_server_error":
      return c.json({ error: "Internal server error", code }, 500);
  }
}

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
        limit,
        offset,
        buildingId,
        status,
        severity,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = query;

      const filter: QueryFilter<AlertDocument> = {};
      if (buildingId) {
        if (!Types.ObjectId.isValid(buildingId)) {
          return c.json(
            {
              error: "Invalid building ID format",
              code: "invalid_building_id",
            },
            400,
          );
        }
        filter.buildingId = buildingId;
      }
      if (status) filter.status = status;
      if (severity) filter.severity = severity;

      const sortDir = sortOrder === "asc" ? 1 : -1;
      const sortConfig = { [sortBy]: sortDir } satisfies Record<string, 1 | -1>;

      const [alerts, total] = await Promise.all([
        AlertModel.find(filter)
          .sort(sortConfig)
          .skip(offset)
          .limit(limit)
          .lean(),
        AlertModel.countDocuments(filter),
      ]);

      return c.json({
        alerts: alerts.map((a) =>
          toAlertDTO(a, { locale: getRequestLocale(c) }),
        ),
        pagination: {
          limit,
          offset,
          total,
        },
      } satisfies ListAlertsResponse);
    },
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
          content: {
            "application/json": {
              schema: resolver(UpdateAlertStatusResponseSchema),
            },
          },
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

      const result = await acknowledge({ id, actor: user.name || user.email });
      if (!result.ok) {
        return alertErrorResponse(c, result.code);
      }

      return c.json({
        success: true as const,
        // SAFETY: result.alert comes back from findOneAndUpdate({ returnDocument: "after" })
        // on the Alert collection, so it is a full document with _id and
        // timestamps as required by AlertDTOInput.
        alert: toAlertDTO(result.alert as AlertDTOInput, {
          locale: getRequestLocale(c),
        }),
      } satisfies UpdateAlertStatusResponse);
    },
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
          content: {
            "application/json": {
              schema: resolver(UpdateAlertStatusResponseSchema),
            },
          },
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

      const result = await resolveManually({
        id,
        actor: user.name || user.email,
      });
      if (!result.ok) {
        return alertErrorResponse(c, result.code);
      }

      return c.json({
        success: true as const,
        // SAFETY: result.alert comes back from findOneAndUpdate({ returnDocument: "after" })
        // on the Alert collection, so it is a full document with _id and
        // timestamps as required by AlertDTOInput.
        alert: toAlertDTO(result.alert as AlertDTOInput, {
          locale: getRequestLocale(c),
        }),
      } satisfies UpdateAlertStatusResponse);
    },
  );

export default app;
export type AppType = typeof app;
