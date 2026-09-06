import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Types, type QueryFilter } from "mongoose";
import { Alert as AlertModel, type AlertDocument } from "../models/Alert";
import {
  ListAlertsQuerySchema,
  ListAlertsResponseSchema,
  AlertIdParamSchema,
  GetAlertParamsSchema,
  AlertResponseSchema,
  UpdateAlertStatusRequestSchema,
} from "@wattguard/shared";

import type {
  ListAlertsResponse,
  AlertResponse,
  ErrorResponse,
} from "@wattguard/shared";
import { ErrorSchema, type ErrorCode } from "@wattguard/shared";
import type { AuthVariables } from "../middleware/auth";
import { apiError, apiSuccess} from "../lib/api-response";
import {
  acknowledge,
  resolveManually,
  toAlertDTO,
} from "../lib/alerts";
import { getRequestLocale } from "../lib/i18n";

function getAlertError(code: ErrorCode) {
  switch (code) {
    case "invalid_alert_id":
      return { error: "Invalid alert ID format", status: 422 as const };
    case "alert_not_found":
      return { error: "Alert not found", status: 404 as const };
    case "alert_not_active":
      return { error: "Only active alerts can be acknowledged", status: 409 as const };
    case "alert_already_resolved":
      return { error: "Alert is already resolved", status: 409 as const };
    default:
      return { error: "Internal server error", status: 500 as const };
  }
}

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      tags: ["Alerts"],
      summary: "List alerts",
      description: "Returns paginated alerts with optional filters",
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
          description: "Validation error",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        422: {
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
            apiError("invalid_building_id", "Invalid building ID format") satisfies ErrorResponse,
            422,
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
          .exec(),
        AlertModel.countDocuments(filter),
      ]);

      return c.json(apiSuccess({
        alerts: alerts.map((a) =>
          toAlertDTO(a, { locale: getRequestLocale(c) }),
        ),
        pagination: {
          limit,
          offset,
          total,
        },
      }) satisfies ListAlertsResponse);
    },
  )
  .get(
    "/:id",
    describeRoute({
      tags: ["Alerts"],
      summary: "Get alert",
      description: "Returns single alert detail by ID",
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Alert retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(AlertResponseSchema),
            },
          },
        },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        422: {
          description: "Invalid alert ID format",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        401: {
          description: "Unauthorized",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        403: {
          description: "Forbidden",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        404: {
          description: "Alert not found",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    validator("param", GetAlertParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      
      if (!Types.ObjectId.isValid(id)) {
        return c.json(apiError("invalid_alert_id", "Invalid alert ID format") satisfies ErrorResponse, 422);
      }
      const alert = await AlertModel.findById(id);
      if (!alert) {
        return c.json(apiError("alert_not_found", "Alert not found") satisfies ErrorResponse, 404);
      }
      return c.json(apiSuccess(toAlertDTO(alert, { locale: getRequestLocale(c) })) satisfies AlertResponse);
    },
  )
  .patch(
    "/:id",
    describeRoute({
      tags: ["Alerts"],
      summary: "Update alert status",
      description: "Updates an alert status (acknowledge or resolve)",
      responses: {
        200: {
          description: "Alert status updated successfully",
          content: {
            "application/json": {
              schema: resolver(AlertResponseSchema),
            },
          },
        },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        422: {
          description: "Invalid alert ID format",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        404: {
          description: "Alert not found",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        409: {
          description: "Invalid alert status transition (already resolved or not active)",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    validator("param", AlertIdParamSchema),
    validator("json", UpdateAlertStatusRequestSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const { status } = c.req.valid("json");
      const user = c.get("userDoc");
      const actor = user.name || user.email;

      const result =
        status === "acknowledged"
          ? await acknowledge({ id, actor })
          : await resolveManually({ id, actor });

      if (!result.ok) {
        const { error, status: errStatus } = getAlertError(result.code);
        return c.json(apiError(result.code, error) satisfies ErrorResponse, errStatus);
      }

      return c.json(apiSuccess(toAlertDTO(result.alert, {
        locale: getRequestLocale(c),
      })) satisfies AlertResponse);
    },
  );


export default app;
export type AppType = typeof app;
