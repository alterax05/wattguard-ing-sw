import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Types, type QueryFilter } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { Sensor, type SensorDocument } from "../models/Sensor";
import { Building } from "../models/Building";
import { SensorReading, type SensorReadingDocument } from "../models/SensorReading";
import { deleteForSensor, pruneForRemovedThresholds } from "../lib/alerts";
import {
  toSensorDTO,
  toSensorReadingDTO,
} from "../lib/sensors";

import { apiError, apiSuccess } from "../lib/api-response";
import {
  ListSensorsQuerySchema,
  ListSensorsResponseSchema,
  CreateSensorRequestSchema,
  SensorResponseSchema,
  GetSensorParamsSchema,
  UpdateSensorParamsSchema,
  UpdateSensorRequestSchema,
  DeleteSensorParamsSchema,
  GetSensorReadingsQuerySchema,
  GetSensorReadingsResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  SensorResponse,
  ErrorResponse,
  GetSensorReadingsResponse,
  ListSensorsResponse,
} from "@wattguard/shared";

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      summary: "List sensors",
      description: "Returns sensors filtered by building, type and status",
      tags: ["Sensors"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Sensors retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(ListSensorsResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid query parameters",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("query", ListSensorsQuerySchema),
    async (c) => {
      const query = c.req.valid("query");

      // Build filter
      const filter: QueryFilter<SensorDocument> = {};
      if (query.building) filter.building = query.building;
      if (query.sensorType) filter.sensorType = query.sensorType;
      if (query.status) filter.status = query.status;

      // Count total
      const total = await Sensor.countDocuments(filter);

      // Sort
      const sortField = query.sortBy || "createdAt";
      const sortOrder = query.sortOrder === "asc" ? 1 : -1;

      // Get sensors with building populated
      const sensors = await Sensor.find(filter)
        .populate("building", "name address")
        .sort({ [sortField]: sortOrder })
        .limit(query.limit)
        .skip(query.offset);

      c.header("X-Total-Count", total.toString());
      return c.json(apiSuccess({
        sensors: sensors.map((s) => toSensorDTO(s, { checkInactivity: true })),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total,
        },
      }) satisfies ListSensorsResponse);
    }
  )
  .post(
    "/",
    describeRoute({
      summary: "Create sensor",
      description: "Creates a new sensor for an existing building",
      tags: ["Sensors"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        201: {
          description: "Sensor created successfully",
          content: {
            "application/json": {
              schema: resolver(SensorResponseSchema),
            },
          },
        },
        400: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        404: {
          description: "Building not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        409: {
          description: "Sensor with this serial number already exists",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("json", CreateSensorRequestSchema),
    async (c) => {
      const userDoc = c.get("userDoc");
      const data = c.req.valid("json");
      const buildingId = data.building;

      // Verify building exists
      const building = await Building.findById(buildingId);
      if (!building) {
        return c.json(apiError("building_not_found", "Building not found") satisfies ErrorResponse, 404);
      }

      // Check for duplicate serial number if provided
      if (data.serialNumber) {
        const existing = await Sensor.findOne({ serialNumber: data.serialNumber });
        if (existing) {
          return c.json(apiError("sensor_serial_exists", "Sensor with this serial number already exists") satisfies ErrorResponse, 409);
        }
      }

      // Create sensor
      const sensor = await Sensor.create({
        ...data,
        installationDate: data.installationDate || new Date(),
        transmissionInterval: data.transmissionInterval || 90,
        status: "active",
        createdBy: userDoc._id,
        updatedBy: userDoc._id,
      });

      c.header("Location", `${c.req.path.replace(/\/+$/, "")}/${sensor._id.toString()}`);
      return c.json(
        apiSuccess(toSensorDTO(sensor)) satisfies SensorResponse,
        201
      );
    }
  )
  .get(
    "/:id",
    describeRoute({
      summary: "Get sensor",
      description: "Returns sensor detail with building data",
      tags: ["Sensors"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Sensor details retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(SensorResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid ID parameter",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        404: {
          description: "Sensor not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("param", GetSensorParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");

      const sensor = await Sensor.findById(id).populate("building", "name address");

      if (!sensor) {
        return c.json(apiError("sensor_not_found", "Sensor not found") satisfies ErrorResponse, 404);
      }

      return c.json(apiSuccess(toSensorDTO(sensor, { checkInactivity: true })) satisfies SensorResponse);
    }
  )
  .patch(
    "/:id",
    describeRoute({
      summary: "Update sensor",
      description: "Updates sensor configuration and thresholds",
      tags: ["Sensors"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Sensor updated successfully",
          content: {
            "application/json": {
              schema: resolver(SensorResponseSchema),
            },
          },
        },
        400: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        404: {
          description: "Sensor not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        409: {
          description: "Sensor with this serial number already exists",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("param", UpdateSensorParamsSchema),
    validator("json", UpdateSensorRequestSchema),
    async (c) => {
      const userDoc = c.get("userDoc");
      const { id } = c.req.valid("param");
      const updates = c.req.valid("json");

      const sensor = await Sensor.findById(id).lean();
      if (!sensor) {
        return c.json(apiError("sensor_not_found", "Sensor not found") satisfies ErrorResponse, 404);
      }

      const removedThresholdTypes: ("min" | "max")[] = [];
      if (updates.minThreshold === null) removedThresholdTypes.push("min");
      if (updates.maxThreshold === null) removedThresholdTypes.push("max");

      // Check for duplicate serial number if being updated
      if (updates.serialNumber && updates.serialNumber !== sensor.serialNumber) {
        const existing = await Sensor.findOne({ serialNumber: updates.serialNumber });
        if (existing) {
          return c.json(apiError("sensor_serial_exists", "Sensor with this serial number already exists") satisfies ErrorResponse, 409);
        }
      }

      const $unset: Record<string, number> = {};
      if (updates.minThreshold === null) $unset.minThreshold = 1;
      if (updates.maxThreshold === null) $unset.maxThreshold = 1;

      const update = {
        $set: {
          ...updates,
          updatedBy: userDoc._id,
        },
        $unset,
      };

      if (updates.minThreshold === null) delete update.$set.minThreshold;
      if (updates.maxThreshold === null) delete update.$set.maxThreshold;

      const updatedSensor = await Sensor.findByIdAndUpdate(sensor._id, update, { returnDocument: "after" });

      await pruneForRemovedThresholds({ sensorId: sensor._id, removedThresholdTypes });

      return c.json(apiSuccess(toSensorDTO(updatedSensor!)) satisfies SensorResponse);
    }
  )
  .delete(
    "/:id",
    describeRoute({
      summary: "Delete sensor",
      description: "Deletes sensor with associated readings and alerts",
      tags: ["Sensors"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        204: {
          description: "Sensor deleted successfully",
        },
        400: {
          description: "Invalid ID parameter",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        404: {
          description: "Sensor not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("param", DeleteSensorParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");

      const sensor = await Sensor.findById(id);
      if (!sensor) {
        return c.json(apiError("sensor_not_found", "Sensor not found") satisfies ErrorResponse, 404);
      }

      // Delete associated readings
      await SensorReading.deleteMany({ "metadata.sensor": id });

      // Delete alerts associated with the sensor
      await deleteForSensor(new Types.ObjectId(id));

      // Delete sensor
      await Sensor.findByIdAndDelete(id);

      return c.body(null, 204);
    }
  )
  .get(
    "/:id/readings",
    describeRoute({
      summary: "Get sensor readings",
      description: "Returns sensor reading history with pagination",
      tags: ["Sensors"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Readings retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(GetSensorReadingsResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid query parameters",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        404: {
          description: "Sensor not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("param", GetSensorParamsSchema),
    validator("query", GetSensorReadingsQuerySchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const query = c.req.valid("query");

      const sensor = await Sensor.findById(id);
      if (!sensor) {
        return c.json(apiError("sensor_not_found", "Sensor not found") satisfies ErrorResponse, 404);
      }

      // Build query
      const filter: QueryFilter<SensorReadingDocument> = {"metadata.sensor": id};

      if (query.startDate || query.endDate) {
        filter.timestamp = {};
        if (query.startDate) filter.timestamp.$gte = new Date(query.startDate);
        if (query.endDate) filter.timestamp.$lte = new Date(query.endDate);
      }

      // Count total
      const total = await SensorReading.countDocuments(filter);

      // Get readings
      const sortOrder = query.sortOrder === "asc" ? 1 : -1;
      const readings = await SensorReading.find(filter)
        .sort({ timestamp: sortOrder })
        .limit(query.limit)
        .skip(query.offset);

      return c.json(apiSuccess({
        readings: readings.map(toSensorReadingDTO),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total,
        },
      }) satisfies GetSensorReadingsResponse);
    }
  );

export default app;
export type AppType = typeof app;
