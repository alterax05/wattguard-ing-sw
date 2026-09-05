import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Types, type QueryFilter } from "mongoose";
import { Alert as AlertModel, type AlertDocument } from "../models/Alert";
import {
  ListAlertsQuerySchema,
  ListAlertsResponseSchema,
  AlertIdParamSchema,
  UpdateAlertStatusRequestSchema,
  UpdateAlertStatusResponseSchema,
} from "@wattguard/shared";

import type {
  ListAlertsResponse,
  UpdateAlertStatusResponse,
  ErrorResponse,
} from "@wattguard/shared";
import { ErrorSchema, type ErrorCode } from "@wattguard/shared";
import type { AuthVariables } from "../middleware/auth";
import { apiError, apiSuccess } from "../lib/api-response";
import {
  acknowledge,
  resolveManually,
  toAlertDTO,
} from "../lib/alerts";
import { getRequestLocale } from "../lib/i18n";

function getAlertError(code: ErrorCode) {
  switch (code) {
    case "invalid_alert_id":
      return { error: "Invalid alert ID format", status: 400 as const };
    case "alert_not_found":
      return { error: "Alert not found", status: 404 as const };
    case "alert_not_active":
      return { error: "Only active alerts can be acknowledged", status: 400 as const };
    case "alert_already_resolved":
      return { error: "Alert is already resolved", status: 400 as const };
    default:
      return { error: "Internal server error", status: 500 as const };
  }
}

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      tags: ["Alerts"],
      summary: "Elenca alert",
      description: "Restituisce gli alert paginati con filtri opzionali",
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
            apiError("invalid_building_id", "Invalid building ID format") satisfies ErrorResponse,
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
  .patch(
    "/:id",
    describeRoute({
      tags: ["Alerts"],
      summary: "Aggiorna stato alert",
      description: "Aggiorna lo stato di un alert (acknowledge o resolve)",
      responses: {
        200: {
          description: "Alert status updated successfully",
          content: {
            "application/json": {
              schema: resolver(UpdateAlertStatusResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid ID format, invalid status transition, or validation error",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        404: {
          description: "Alert not found",
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
      })) satisfies UpdateAlertStatusResponse);
    },
  );


export default app;
export type AppType = typeof app;
