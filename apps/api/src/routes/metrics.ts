import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AuthVariables } from "../middleware/auth";
import { Sensor } from "../models/Sensor";
import { SensorReading } from "../models/SensorReading";
import { Alert } from "../models/Alert";

import {
  MetricsHistoryQuerySchema,
  MetricsResponseSchema,
  MetricsHistoryResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  MetricsHistoryResponse,
  MetricsResponse,
  ErrorResponse,
} from "@wattguard/shared";
import { apiError, apiSuccess } from "../lib/api-response";

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      description: "Get aggregated system-wide KPI metrics across all buildings",
      tags: ["Metrics"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "System metrics retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(MetricsResponseSchema),
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
          {
            $group: {
              _id: null,
              total: { $sum: "$lastReading.value" },
            },
          },
        ]),
        Sensor.aggregate<ConsumptionAgg>([
          {
            $match: {
              sensorType: "gas_meter",
              status: "active",
              "lastReading.value": { $exists: true },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$lastReading.value" },
            },
          },
        ]),
      ]);

      const totalElectricity = electricityAgg[0]?.total ?? null;
      const totalGas = gasAgg[0]?.total ?? null;

      return c.json(apiSuccess({
        sensors: {
          active: activeSensors,
          total: totalSensors,
        },
        alerts: {
          active: activeAlerts,
        },
        consumption: {
          electricity: totalElectricity,
          gas: totalGas,
        },
      }) satisfies MetricsResponse);
    },
  )
  .get(
    "/history",
    describeRoute({
      description: "Get aggregated historical energy and gas readings across all buildings",
      tags: ["Metrics"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Historical metrics data retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(MetricsHistoryResponseSchema),
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
    validator("query", MetricsHistoryQuerySchema),
    async (c) => {
      const { startDate, endDate, interval } = c.req.valid("query");

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
        return c.json(apiError("invalid_date_range", "Invalid date range: startDate must be before endDate") satisfies ErrorResponse, 400);
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
            avgValue: { $round: ["$avgValue", 2] },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Merge energy_meter and gas_meter into a single entry per bucket date
      const bucketMap = new Map<string, { electricity: number | null; gas: number | null }>();

      for (const b of rawBuckets) {
        const key = b._id instanceof Date ? b._id.toISOString() : new Date(b._id).toISOString();
        const existing = bucketMap.get(key) ?? { electricity: null, gas: null };

        if (b.sensorType === "energy_meter") {
          existing.electricity = b.avgValue;
        } else if (b.sensorType === "gas_meter") {
          existing.gas = b.avgValue;
        }

        bucketMap.set(key, existing);
      }

      const data = Array.from(bucketMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, values]) => ({
          date,
          electricity: values.electricity,
          gas: values.gas,
        }));

      return c.json(apiSuccess({
        period: {
          startDate,
          endDate,
          interval: interval ?? "day",
        },
        data,
      }) satisfies MetricsHistoryResponse);
    },
  );

export default app;
export type AppType = typeof app;
