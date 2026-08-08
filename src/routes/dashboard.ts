import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AuthVariables } from "../middleware/auth";
import { Sensor } from "../models/Sensor";
import { SensorReading } from "../models/SensorReading";
import { Alert } from "../models/Alert";

import {
  DashboardHistoryQuerySchema,
  DashboardStatsResponseSchema,
  DashboardHistoryResponseSchema,
  ErrorSchema,
} from "../schemas/dashboard";
import type {
  DashboardHistoryResponse,
  DashboardStatsResponse,
} from "../schemas/dashboard";

const app = new Hono<{ Variables: AuthVariables }>()
  /**
   * GET /api/dashboard/stats
   *
   * Returns aggregated stats across all buildings:
   *   - Active / total sensor counts
   *   - Active alert count
   *   - Current total electricity consumption (sum of energy_meter lastReading values)
   *   - Current total gas consumption (sum of gas_meter lastReading values)
   */
  .get(
    "/stats",
    describeRoute({
      description: "Get aggregated dashboard statistics across all buildings",
      tags: ["Dashboard"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Dashboard stats retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(DashboardStatsResponseSchema),
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    async (c) => {
      // Sensor counts
      const [totalSensors, activeSensors] = await Promise.all([
        Sensor.countDocuments(),
        Sensor.countDocuments({ status: "active" }),
      ]);

      // Active alert count
      const activeAlerts = await Alert.countDocuments({ status: "active" });

      // Current total electricity (energy_meter sensors) — sum lastReading.value
      type ConsumptionAgg = { _id: null; total: number };

      const [electricityAgg, gasAgg] = await Promise.all([
        Sensor.aggregate<ConsumptionAgg>([
          {
            $match: {
              sensorType: "energy_meter",
              status: "active",
              "lastReading.value": { $exists: true },
            },
          },
          { $group: { _id: null, total: { $sum: "$lastReading.value" } } },
        ]),
        Sensor.aggregate<ConsumptionAgg>([
          {
            $match: {
              sensorType: "gas_meter",
              status: "active",
              "lastReading.value": { $exists: true },
            },
          },
          { $group: { _id: null, total: { $sum: "$lastReading.value" } } },
        ]),
      ]);

      return c.json({
        sensors: {
          active: activeSensors,
          total: totalSensors,
        },
        alerts: {
          active: activeAlerts,
        },
        consumption: {
          electricity: electricityAgg[0]?.total ?? null,
          gas: gasAgg[0]?.total ?? null,
        },
      } satisfies DashboardStatsResponse);
    }
  )

  /**
   * GET /api/dashboard/history
   *
   * Returns time-bucketed aggregate readings across all buildings for energy_meter
   * and gas_meter sensor types. Useful for the dashboard overview chart.
   *
   * Query params:
   *   - startDate: ISO 8601 date/datetime
   *   - endDate:   ISO 8601 date/datetime
   *   - interval:  "hour" | "day" | "week"  (default: "day")
   */
  .get(
    "/history",
    describeRoute({
      description: "Get aggregated energy and gas consumption history across all buildings",
      tags: ["Dashboard"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Historical data retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(DashboardHistoryResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid query parameters",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        401: {
          description: "Unauthorized",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    validator("query", DashboardHistoryQuerySchema),
    async (c) => {
      const { startDate, endDate, interval } = c.req.valid("query");

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
        return c.json({ error: "Invalid date range: startDate must be before endDate" }, 400);
      }

      // Determine the millisecond bucket size for grouping
      const bucketMs =
        interval === "hour"
          ? 60 * 60 * 1000
          : interval === "week"
          ? 7 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000; // "day" default

      type RawBucket = {
        _id: Date;
        sensorType: string;
        avgValue: number;
      };

      // Aggregate readings bucketed by interval, split by sensorType
      const rawBuckets: RawBucket[] = await SensorReading.aggregate([
        {
          $match: {
            timestamp: { $gte: start, $lte: end },
            "metadata.sensorType": { $in: ["energy_meter", "gas_meter"] },
          },
        },
        {
          $group: {
            _id: {
              bucket: {
                $toDate: {
                  $subtract: [
                    { $toLong: "$timestamp" },
                    { $mod: [{ $toLong: "$timestamp" }, bucketMs] },
                  ],
                },
              },
              sensorType: "$metadata.sensorType",
            },
            avgValue: { $avg: "$value" },
          },
        },
        {
          $project: {
            _id: "$_id.bucket",
            sensorType: "$_id.sensorType",
            avgValue: 1,
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Pivot: collect all unique bucket dates and merge electricity + gas
      const bucketMap = new Map<
        string,
        { date: Date; electricity: number | null; gas: number | null }
      >();

      for (const row of rawBuckets) {
        const key = row._id.toISOString();
        if (!bucketMap.has(key)) {
          bucketMap.set(key, { date: row._id, electricity: null, gas: null });
        }
        const entry = bucketMap.get(key)!;
        if (row.sensorType === "energy_meter") {
          entry.electricity = Math.round(row.avgValue * 100) / 100;
        } else if (row.sensorType === "gas_meter") {
          entry.gas = Math.round(row.avgValue * 100) / 100;
        }
      }

      // Format dates depending on interval
      const formatDate = (d: Date): string => {
        if (interval === "hour") {
          return d.toLocaleString("it-IT", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Rome",
          });
        }
        if (interval === "week") {
          return d.toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "Europe/Rome",
          });
        }
        // day
        return d.toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "short",
          timeZone: "Europe/Rome",
        });
      };

      const data = Array.from(bucketMap.values()).map((entry) => ({
        date: formatDate(entry.date),
        electricity: entry.electricity,
        gas: entry.gas,
      }));

      return c.json({
        period: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          interval,
        },
        data,
      } satisfies DashboardHistoryResponse);
    }
  );

export default app;
export type AppType = typeof app;
