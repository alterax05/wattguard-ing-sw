import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Types, type QueryFilter } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { Sensor, type SensorDocument, type SensorType } from "../models/Sensor";
import { Building, type BuildingDocument } from "../models/Building";
import { SensorReading, type SensorReadingDocument } from "../models/SensorReading";
import { deleteForSensor, pruneForRemovedThresholds } from "../lib/alerts";

import {
  ListSensorsQuerySchema,
  ListSensorsResponseSchema,
  CreateSensorRequestSchema,
  CreateSensorResponseSchema,
  GetSensorParamsSchema,
  GetSensorResponseSchema,
  UpdateSensorParamsSchema,
  UpdateSensorRequestSchema,
  UpdateSensorResponseSchema,
  DeleteSensorParamsSchema,
  DeleteSensorResponseSchema,
  GetSensorReadingsQuerySchema,
  GetSensorReadingsResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  CreateSensorResponse,
  DeleteSensorResponse,
  GetSensorReadingsResponse,
  GetSensorResponse,
  ListSensorsResponse,
  UpdateSensorResponse,
} from "@wattguard/shared";

const app = new Hono<{ Variables: AuthVariables }>()
  /**
   * GET /api/sensors - List all sensors with filters
   */
  .get(
    "/",
    describeRoute({
      description: "List all sensors with optional filters (building, type, status)",
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
      },
    }),
    validator("query", ListSensorsQuerySchema),
    async (c) => {
      const query = c.req.valid("query");

      // Build filter
      const filter: QueryFilter<SensorDocument> = {};
      if (query.buildingId) filter.buildingId = query.buildingId;
      if (query.sensorType) filter.sensorType = query.sensorType;
      if (query.status) filter.status = query.status;

      // Count total
      const total = await Sensor.countDocuments(filter);

      // Sort
      const sortField = query.sortBy || "createdAt";
      const sortOrder = query.sortOrder === "asc" ? 1 : -1;

      // Get sensors with building populated
      const sensors = await Sensor.find(filter)
        .populate< { buildingId : BuildingDocument } >("buildingId", "name address")
        .sort({ [sortField]: sortOrder })
        .limit(query.limit)
        .skip(query.offset);

      // Auto-mark sensors inactive when they exceed 2× their transmission interval
      // without sending a reading. Only sensors currently "active" are affected;
      // manually-set statuses (maintenance, error) are left untouched.
      await Promise.all(
        sensors.map(async (sensor) => sensor.updateStatus())
      );

      return c.json({
        sensors: sensors.map((sensor) => {
          const building = sensor.buildingId;
          return {
            id: sensor._id.toString(),
            buildingId: building?._id?.toString() ?? sensor.buildingId.toString(),
            sensorType: sensor.sensorType,
            location: sensor.location,
            serialNumber: sensor.serialNumber ?? undefined,
            installationDate: sensor.installationDate.toISOString(),
            status: sensor.status,
            isOffline: sensor.status === "inactive",
            lastReading: sensor.lastReading
              ? {
                  value: sensor.lastReading.value,
                  timestamp: sensor.lastReading.timestamp.toISOString(),
                  unit: sensor.lastReading.unit,
                }
              : undefined,
            transmissionInterval: sensor.transmissionInterval,
            minThreshold: sensor.minThreshold ?? undefined,
            maxThreshold: sensor.maxThreshold ?? undefined,
            building: building?.name
              ? {
                  id: building._id.toString(),
                  name: building.name,
                  address: building.address,
                }
              : undefined,
            createdBy: sensor.createdBy?.toString(),
            updatedBy: sensor.updatedBy?.toString(),
            createdAt: sensor.createdAt?.toISOString(),
            updatedAt: sensor.updatedAt?.toISOString(),
          };
        }),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total,
        },
      } satisfies ListSensorsResponse);
    }
  )
  /**
   * POST /api/sensors - Create a new sensor
   */
  .post(
    "/",
    describeRoute({
      description: "Create a new sensor for a building",
      tags: ["Sensors"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        201: {
          description: "Sensor created successfully",
          content: {
            "application/json": {
              schema: resolver(CreateSensorResponseSchema),
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
      },
    }),
    validator("json", CreateSensorRequestSchema),
    async (c) => {
      const userDoc = c.get("userDoc");
      const data = c.req.valid("json");

      // Verify building exists
      const building = await Building.findById(data.buildingId);
      if (!building) {
        return c.json({ error: "Building not found", code: "building_not_found" }, 404);
      }

      // Check for duplicate serial number if provided
      if (data.serialNumber) {
        const existing = await Sensor.findOne({ serialNumber: data.serialNumber });
        if (existing) {
          return c.json({ error: "Sensor with this serial number already exists", code: "sensor_serial_exists" }, 400);
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

      return c.json(
        {
          success: true,
          sensor: {
            id: sensor._id.toString(),
            buildingId: building?._id?.toString() ?? sensor.buildingId.toString(),
            sensorType: sensor.sensorType,
            location: sensor.location,
            serialNumber: sensor.serialNumber ?? undefined,
            installationDate: sensor.installationDate.toISOString(),
            status: sensor.status,
            transmissionInterval: sensor.transmissionInterval,
            createdBy: sensor.createdBy.toString(),
            updatedBy: sensor.updatedBy.toString(),
            createdAt: sensor.createdAt?.toISOString(),
            updatedAt: sensor.updatedAt?.toISOString(),
          },
        } satisfies CreateSensorResponse,
        201
      );
    }
  )

  /**
   * GET /api/sensors/:id - Get sensor details
   */
  .get(
    "/:id",
    describeRoute({
      description: "Get sensor details with building information",
      tags: ["Sensors"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Sensor details retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(GetSensorResponseSchema),
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

      const sensor = await Sensor.findById(id).populate<{ buildingId: BuildingDocument }>("buildingId", "name address");

      if (!sensor) {
        return c.json({ error: "Sensor not found", code: "sensor_not_found" }, 404);
      }

      const building = sensor.buildingId;

      await sensor.updateStatus();

      return c.json({
        sensor: {
          id: sensor._id.toString(),
          buildingId: building?._id?.toString() ?? sensor.buildingId.toString(),
          sensorType: sensor.sensorType,
          location: sensor.location,
          serialNumber: sensor.serialNumber ?? undefined,
          installationDate: sensor.installationDate.toISOString(),
          status: sensor.status,
          isOffline: sensor.status === "inactive",
          lastReading: sensor.lastReading
            ? {
                value: sensor.lastReading.value,
                timestamp: sensor.lastReading.timestamp.toISOString(),
                unit: sensor.lastReading.unit,
              }
            : undefined,
          transmissionInterval: sensor.transmissionInterval,
          minThreshold: sensor.minThreshold ?? undefined,
          maxThreshold: sensor.maxThreshold ?? undefined,
          building: building
            ? {
                id: building._id.toString(),
                name: building.name,
                address: building.address,
              }
            : undefined,
          createdBy: sensor.createdBy?.toString(),
          updatedBy: sensor.updatedBy?.toString(),
          createdAt: sensor.createdAt?.toISOString(),
          updatedAt: sensor.updatedAt?.toISOString(),
        },
      } satisfies GetSensorResponse);
    }
  )

  /**
   * PATCH /api/sensors/:id - Update a sensor
   */
  .patch(
    "/:id",
    describeRoute({
      description: "Update sensor configuration",
      tags: ["Sensors"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Sensor updated successfully",
          content: {
            "application/json": {
              schema: resolver(UpdateSensorResponseSchema),
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
        return c.json({ error: "Sensor not found", code: "sensor_not_found" }, 404);
      }

      const removedThresholdTypes: ("min" | "max")[] = [];
      if (updates.minThreshold === null) removedThresholdTypes.push("min");
      if (updates.maxThreshold === null) removedThresholdTypes.push("max");

      // Check for duplicate serial number if being updated
      if (updates.serialNumber && updates.serialNumber !== sensor.serialNumber) {
        const existing = await Sensor.findOne({ serialNumber: updates.serialNumber });
        if (existing) {
          return c.json({ error: "Sensor with this serial number already exists", code: "sensor_serial_exists" }, 400);
        }
      }

      const update = {
        $set: {
          ...updates,
          updatedBy: userDoc._id,
        },
        $unset: {
          ...(updates.minThreshold === null ? { minThreshold: 1 } : {}),
          ...(updates.maxThreshold === null ? { maxThreshold: 1 } : {}),
        },
      };

      if (updates.minThreshold === null) delete update.$set.minThreshold;
      if (updates.maxThreshold === null) delete update.$set.maxThreshold;

      const updatedSensor = await Sensor.findByIdAndUpdate(sensor._id, update, { returnDocument: "after" });

      await pruneForRemovedThresholds({ sensorId: sensor._id, removedThresholdTypes });

      return c.json({
        success: true,
        sensor: {
          id: updatedSensor!._id.toString(),
          buildingId: updatedSensor!.buildingId.toString(),
          sensorType: updatedSensor!.sensorType,
          location: updatedSensor!.location,
          serialNumber: updatedSensor!.serialNumber ?? undefined,
          installationDate: updatedSensor!.installationDate.toISOString(),
          status: updatedSensor!.status,
          lastReading: updatedSensor!.lastReading
            ? {
                value: updatedSensor!.lastReading.value,
                timestamp: updatedSensor!.lastReading.timestamp.toISOString(),
                unit: updatedSensor!.lastReading.unit,
              }
            : undefined,
          transmissionInterval: updatedSensor!.transmissionInterval,
          minThreshold: updatedSensor!.minThreshold ?? undefined,
          maxThreshold: updatedSensor!.maxThreshold ?? undefined,
          createdBy: updatedSensor!.createdBy?.toString(),
          updatedBy: updatedSensor!.updatedBy?.toString(),
          createdAt: updatedSensor!.createdAt?.toISOString(),
          updatedAt: updatedSensor!.updatedAt?.toISOString(),
        },
      } satisfies UpdateSensorResponse);
    }
  )

  /**
   * DELETE /api/sensors/:id - Delete a sensor
   */
  .delete(
    "/:id",
    describeRoute({
      description: "Delete a sensor and its readings (Gestione sensori)",
      tags: ["Sensors"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Sensor deleted successfully",
          content: {
            "application/json": {
              schema: resolver(DeleteSensorResponseSchema),
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
        return c.json({ error: "Sensor not found", code: "sensor_not_found" }, 404);
      }

      // Delete associated readings
      await SensorReading.deleteMany({ "metadata.sensorId": id });

      // Delete alerts associated with the sensor
      await deleteForSensor(new Types.ObjectId(id));

      // Delete sensor
      await Sensor.findByIdAndDelete(id);

      return c.json({
        success: true,
        message: `Sensor "${sensor.location}" deleted successfully`,
      } satisfies DeleteSensorResponse);
    }
  )
  /**
   * GET /api/sensors/:id/readings - Get sensor readings history
   */
  .get(
    "/:id/readings",
    describeRoute({
      description: "Get historical sensor readings",
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
        return c.json({ error: "Sensor not found", code: "sensor_not_found" }, 404);
      }

      // Build query
      const filter: QueryFilter<SensorReadingDocument> = {"metadata.sensorId": id};

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

      return c.json({
        readings: readings.map((r) => ({
          id: r._id?.toString(),
          timestamp: r.timestamp.toISOString(),
          value: r.value,
          unit: r.unit,
          metadata: r.metadata
            ? {
                sensorId: r.metadata.sensorId.toString(),
                buildingId: r.metadata.buildingId.toString(),
                sensorType: r.metadata.sensorType as SensorType,
              }
            : undefined,
        })),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total,
        },
      } satisfies GetSensorReadingsResponse);
    }
  );

export default app;
export type AppType = typeof app;
