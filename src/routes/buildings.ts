import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import mongoose, { Types, type QueryFilter, type Document } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { Building, type IBuilding } from "../models/Building";
import { BuildingType, type IBuildingType } from "../models/BuildingType";
import { Sensor } from "../models/Sensor";
import { SensorReading, type ISensorReading } from "../models/SensorReading";
import { logCreate, logUpdate, logDelete } from "../middleware/audit";
import {
  SearchBuildingsQuerySchema,
  SearchBuildingsResponseSchema,
  CreateBuildingRequestSchema,
  CreateBuildingResponseSchema,
  GetBuildingParamsSchema,
  GetBuildingResponseSchema,
  UpdateBuildingParamsSchema,
  UpdateBuildingRequestSchema,
  UpdateBuildingResponseSchema,
  DeleteBuildingParamsSchema,
  DeleteBuildingResponseSchema,
  GetBuildingSensorsResponseSchema,
  GetBuildingRealTimeResponseSchema,
  GetBuildingHistoryQuerySchema,
  GetBuildingHistoryResponseSchema,
  ErrorSchema,
} from "../schemas/buildings";

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      description: "Search and list buildings with multiple filters",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Buildings retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(SearchBuildingsResponseSchema),
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("query", SearchBuildingsQuerySchema),
    async (c) => {
      const query = c.req.valid("query");

      const filter: QueryFilter<IBuilding> = {};

      if (query.name) {
        filter.name = { $regex: query.name, $options: "i" }; // Case-insensitive partial match
      }

      if (query.address) {
        filter.address = { $regex: query.address, $options: "i" };
      }

      if (query.zone) {
        filter.geographicZone = { $regex: query.zone, $options: "i" };
      }

      if (query.buildingType) {
        filter.buildingType = query.buildingType;
      }

      if (query.status) {
        filter.status = query.status;
      }

      // Count total matching documents
      const total = await Building.countDocuments(filter);

      // Apply sorting
      const sortBy = query.sortBy || "updatedAt";
      const sortOrder = query.sortOrder === "asc" ? 1 : -1;
      const sort: Record<string, any> = { [sortBy]: sortOrder };

      // Execute query with pagination
      const buildings = await Building.find(filter)
        .populate("buildingType", "name description")
        .sort(sort)
        .limit(query.limit)
        .skip(query.offset);

      return c.json({
        buildings: buildings.map((b) => {
          const buildingType = b.buildingType;
          return {
            id: b._id.toString(),
            name: b.name,
            address: b.address,
            surface: b.surface,
            buildingType: (buildingType instanceof mongoose.Types.ObjectId)
              ? buildingType.toString()
              : {
                  id: (buildingType as IBuildingType & Document)._id.toString(),
                  name: (buildingType as IBuildingType & Document).name,
                  description: (buildingType as IBuildingType & Document).description,
                },
            heatingSystemType: b.heatingSystemType,
            status: b.status,
            geographicZone: b.geographicZone,
            updatedAt: b.updatedAt?.toISOString(),
          };
        }),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total,
        },
      });
    }
  )
  .post(
    "/",
    describeRoute({
      description: "Create a new building (Gestione edifici)",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        201: {
          description: "Building created successfully",
          content: {
            "application/json": {
              schema: resolver(CreateBuildingResponseSchema),
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
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        404: {
          description: "Building type not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("json", CreateBuildingRequestSchema),
    async (c) => {
      const userDoc = c.get("userDoc");
      const data = c.req.valid("json");

      // Validate building type exists
      const buildingType = await BuildingType.findById(data.buildingType);
      if (!buildingType) {
        return c.json({ error: "Building type not found" }, 404);
      }

      // Create building
      const building = await Building.create({
        ...data,
        createdBy: userDoc._id,
        updatedBy: userDoc._id,
        status: "active",
      });

      await logCreate("building", building._id, building.toObject(), userDoc._id);

      // Populate buildingType for response
      await building.populate("buildingType", "name description");
      const bt = building.buildingType!;

      return c.json(
        {
          success: true,
          building: {
            id: building._id.toString(),
            name: building.name,
            address: building.address,
            surface: building.surface,
            buildingType: (bt instanceof mongoose.Types.ObjectId)
              ? bt.toString()
              : {
                  id: (bt as IBuildingType & Document)._id.toString(),
                  name: (bt as IBuildingType & Document).name,
                  description: (bt as IBuildingType & Document).description,
                },
            heatingSystemType: building.heatingSystemType,
            status: building.status,
            geographicZone: building.geographicZone,
            constructionYear: building.constructionYear,
            createdBy: building.createdBy.toString(),
            updatedBy: building.updatedBy.toString(),
            createdAt: building.createdAt?.toISOString(),
            updatedAt: building.updatedAt?.toISOString(),
          },
        },
        201
      );
    }
  )

  /**
   * GET /api/buildings/:id - Get building details 
   */
  .get(
    "/:id",
    describeRoute({
      description: "Get building details",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Building details retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(GetBuildingResponseSchema),
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden",
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
    validator("param", GetBuildingParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");

      const building = await Building.findById(id).populate("buildingType", "name description");

      if (!building) {
        return c.json({ error: "Building not found" }, 404);
      }

      const bt = building.buildingType!;

      return c.json({
        building: {
          id: building._id.toString(),
          name: building.name,
          address: building.address,
          surface: building.surface,
          buildingType: (bt instanceof mongoose.Types.ObjectId)
            ? bt.toString()
            : {
                id: (bt as IBuildingType & Document)._id.toString(),
                name: (bt as IBuildingType & Document).name,
                description: (bt as IBuildingType & Document).description,
              },
          heatingSystemType: building.heatingSystemType,
          status: building.status,
          geographicZone: building.geographicZone,
          constructionYear: building.constructionYear,
          createdBy: building.createdBy.toString(),
          updatedBy: building.updatedBy.toString(),
          createdAt: building.createdAt?.toISOString(),
          updatedAt: building.updatedAt?.toISOString(),
        },
      });
    }
  )

  /**
   * PATCH /api/buildings/:id - Update a building
   */
  .patch(
    "/:id",
    describeRoute({
      description: "Update a building (Gestione edifici)",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Building updated successfully",
          content: {
            "application/json": {
              schema: resolver(UpdateBuildingResponseSchema),
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
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        404: {
          description: "Building or building type not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("param", UpdateBuildingParamsSchema),
    validator("json", UpdateBuildingRequestSchema),
    async (c) => {
      const userDoc = c.get("userDoc");
      const { id } = c.req.valid("param");
      const updates = c.req.valid("json");

      const building = await Building.findById(id);
      if (!building) {
        return c.json({ error: "Building not found" }, 404);
      }

      // Store old state for audit log
      const oldBuilding = building.toObject();

      // Validate building type if being updated
      if (updates.buildingType) {
        const buildingType = await BuildingType.findById(updates.buildingType);
        if (!buildingType) {
          return c.json({ error: "Building type not found" }, 404);
        }
      }

      // Apply updates
      if (updates.name !== undefined) building.name = updates.name;
      if (updates.address !== undefined) building.address = updates.address;
      if (updates.surface !== undefined) building.surface = updates.surface;
      if (updates.buildingType !== undefined) building.buildingType = new Types.ObjectId(updates.buildingType);
      if (updates.heatingSystemType !== undefined)
        building.heatingSystemType = updates.heatingSystemType;
      if (updates.constructionYear !== undefined)
        building.constructionYear = updates.constructionYear;
      if (updates.geographicZone !== undefined) building.geographicZone = updates.geographicZone;
      if (updates.status !== undefined) building.status = updates.status;

      building.updatedBy = userDoc._id as Types.ObjectId;

      await building.save();

      await logUpdate("building", building._id, oldBuilding, building.toObject(), userDoc._id);

      // Populate for response
      await building.populate("buildingType", "name description");
      const bt = building.buildingType!;

      return c.json({
        success: true,
        building: {
          id: building._id.toString(),
          name: building.name,
          address: building.address,
          surface: building.surface,
          buildingType: (bt instanceof mongoose.Types.ObjectId)
            ? bt.toString()
            : {
                id: (bt as IBuildingType & Document)._id.toString(),
                name: (bt as IBuildingType & Document).name,
                description: (bt as IBuildingType & Document).description,
              },
          heatingSystemType: building.heatingSystemType,
          status: building.status,
          geographicZone: building.geographicZone,
          constructionYear: building.constructionYear,
          createdBy: building.createdBy.toString(),
          updatedBy: building.updatedBy.toString(),
          createdAt: building.createdAt?.toISOString(),
          updatedAt: building.updatedAt?.toISOString(),
        },
      });
    }
  )

  /**
   * DELETE /api/buildings/:id - Delete a building with cascade
   */
  .delete(
    "/:id",
    describeRoute({
      description: "Delete a building and all associated sensors and readings",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Building deleted successfully",
          content: {
            "application/json": {
              schema: resolver(DeleteBuildingResponseSchema),
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden",
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
    validator("param", DeleteBuildingParamsSchema),
    async (c) => {
      const userDoc = c.get("userDoc");
      const { id } = c.req.valid("param");

      const building = await Building.findById(id);
      if (!building) {
        return c.json({ error: "Building not found" }, 404);
      }

      // Store for audit log
      const buildingData = building.toObject();

      // Cascade delete: first delete sensor readings, then sensors, then building
      await SensorReading.deleteMany({ "metadata.buildingId": new Types.ObjectId(id) });
      await Sensor.deleteMany({ buildingId: id });
      await Building.findByIdAndDelete(id);

      await logDelete("building", building._id, buildingData, userDoc._id);

      return c.json({
        success: true,
        message: "Building and associated data deleted successfully",
      });
    }
  )

  /**
   * GET /api/buildings/:id/sensors - Get building sensors
   */
  .get(
    "/:id/sensors",
    describeRoute({
      description: "Get all sensors for a building with their current status",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Sensors retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(GetBuildingSensorsResponseSchema),
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden",
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
    validator("param", GetBuildingParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");

      const building = await Building.findById(id);
      if (!building) {
        return c.json({ error: "Building not found" }, 404);
      }

      const sensors = await Sensor.find({ buildingId: id });

      return c.json({
        sensors: sensors.map((s) => ({
          id: s._id.toString(),
          serialNumber: s.serialNumber,
          sensorType: s.sensorType,
          location: s.location,
          status: s.status,
          installationDate: s.installationDate?.toISOString(),
          transmissionInterval: s.transmissionInterval,
          lastReading: s.lastReading ? {
            value: s.lastReading.value,
            unit: s.lastReading.unit,
            timestamp: s.lastReading.timestamp?.toISOString(),
          } : null,
          buildingId: s.buildingId.toString(),
          createdAt: s.createdAt?.toISOString(),
          updatedAt: s.updatedAt?.toISOString(),
        })),
      });
    }
  )

  /**
   * GET /api/buildings/:id/real-time - Get real-time sensor data
   */
  .get(
    "/:id/real-time",
    describeRoute({
      description: "Get real-time sensor data for a building",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Real-time data retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(GetBuildingRealTimeResponseSchema),
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden",
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
    validator("param", GetBuildingParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");

      const building = await Building.findById(id);
      if (!building) {
        return c.json({ error: "Building not found" }, 404);
      }

      // Get all active sensors for this building
      const sensors = await Sensor.find({ buildingId: id, status: "active" });

      // Find sensors by type and get their last readings
      const internalTempSensor = sensors.find((s) => s.sensorType === "internal_temp");
      const externalTempSensor = sensors.find((s) => s.sensorType === "external_temp");
      const energyMeterSensor = sensors.find((s) => s.sensorType === "energy_meter");

      return c.json({
        buildingId: building._id.toString(),
        buildingName: building.name,
        timestamp: new Date().toISOString(),
        data: {
          internalTemperature: {
            value: internalTempSensor?.lastReading?.value ?? null,
            unit: internalTempSensor?.lastReading?.unit ?? "°C",
            timestamp: internalTempSensor?.lastReading?.timestamp?.toISOString() ?? null,
            sensorId: internalTempSensor?._id.toString() ?? null,
          },
          externalTemperature: {
            value: externalTempSensor?.lastReading?.value ?? null,
            unit: externalTempSensor?.lastReading?.unit ?? "°C",
            timestamp: externalTempSensor?.lastReading?.timestamp?.toISOString() ?? null,
            sensorId: externalTempSensor?._id.toString() ?? null,
          },
          energyConsumption: {
            value: energyMeterSensor?.lastReading?.value ?? null,
            unit: energyMeterSensor?.lastReading?.unit ?? "kW",
            timestamp: energyMeterSensor?.lastReading?.timestamp?.toISOString() ?? null,
            sensorId: energyMeterSensor?._id.toString() ?? null,
          },
        },
      });
    }
  )
  // ... (rest of file) ...
  .get(
    "/:id/history",
    describeRoute({
      description: "Get building historical sensor data for graphing",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Historical data retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(GetBuildingHistoryResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid date range",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden",
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
    validator("param", GetBuildingParamsSchema),
    validator("query", GetBuildingHistoryQuerySchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const { startDate, endDate, sensorType, interval } = c.req.valid("query");

      const building = await Building.findById(id);
      if (!building) {
        return c.json({ error: "Building not found" }, 404);
      }

      // Build query for sensor readings
      const query: QueryFilter<ISensorReading> = {
        "metadata.buildingId": id,
        timestamp: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };

      if (sensorType) {
        query["metadata.sensorType"] = sensorType;
      }

      // Query historical data from time-series collection
      const readings = await SensorReading.find(query)
        .sort({ timestamp: 1 })
        .limit(1000); // Limit for performance

      return c.json({
        buildingId: building._id.toString(),
        buildingName: building.name,
        period: {
          startDate,
          endDate,
        },
        data: readings.map((r) => ({
          timestamp: r.timestamp.toISOString(),
          value: r.value,
          unit: r.unit,
          sensorType: r.metadata.sensorType,
          sensorId: r.metadata.sensorId?.toString(),
        })),
      });
    }
  );

export default app;
export type AppType = typeof app;
