import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import mongoose, { Types, type QueryFilter, type Document } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { Building, type IBuilding } from "../models/Building";
import { BuildingType, type IBuildingType } from "../models/BuildingType";
import { Sensor } from "../models/Sensor";
import { SensorReading, type ISensorReading } from "../models/SensorReading";

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
  GetBuildingEfficiencyQuerySchema,
  GetBuildingEfficiencyResponseSchema,
  ErrorSchema,
} from "../schemas/buildings";
import { getCoordinates, getAverageHistoricalTemperature } from "../lib/weather";

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
      const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder };

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
      const buildingData = c.req.valid("json");

      const buildingType = await BuildingType.findById(buildingData.buildingType);
      if (!buildingType) {
        return c.json({ error: "Building type not found" }, 404);
      }

      const building = new Building({
        ...buildingData,
        createdBy: userDoc._id,
        updatedBy: userDoc._id,
      });

      await building.save();
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
      }, 201);
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
      const { id } = c.req.valid("param");

      const building = await Building.findById(id);
      if (!building) {
        return c.json({ error: "Building not found" }, 404);
      }

      

      // Cascade delete: first delete sensor readings, then sensors, then building
      await SensorReading.deleteMany({ "metadata.buildingId": new Types.ObjectId(id) });
      await Sensor.deleteMany({ buildingId: id });
      await Building.findByIdAndDelete(id);

      

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
      const { startDate, endDate, sensorType } = c.req.valid("query");

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
  )
  .get(
    "/:id/efficiency",
    describeRoute({
      description: "Calculate building thermal efficiency over a time period",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Efficiency metrics calculated successfully",
          content: {
            "application/json": {
              schema: resolver(GetBuildingEfficiencyResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid request parameters",
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
    validator("query", GetBuildingEfficiencyQuerySchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const { startDate, endDate } = c.req.valid("query");

      const building = await Building.findById(id);
      if (!building) {
        return c.json({ error: "Building not found" }, 404);
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Physics Constants
      const CEILING_HEIGHT = 3.0; // meters
      const AIR_DENSITY = 1.225; // kg/m³
      const SPECIFIC_HEAT_AIR = 1005; // J/(kg·K)
      const ROOM_HEAT_CAPACITY = building.surface * CEILING_HEIGHT * AIR_DENSITY * SPECIFIC_HEAT_AIR;

      // MongoDB Aggregation Pipeline for Physics-Based Efficiency
      const pipeline: any[] = [
        // 1. Match & Filter
        {
          $match: {
            "metadata.buildingId": new Types.ObjectId(id),
            timestamp: { $gte: start, $lte: end },
            "metadata.sensorType": { $in: ["energy_meter", "internal_temp", "external_temp"] }
          }
        },
        // 2. Bucket (Group by 15m)
        {
          $group: {
            _id: {
              $toDate: {
                $subtract: [
                  { $toLong: "$timestamp" },
                  { $mod: [{ $toLong: "$timestamp" }, 15 * 60 * 1000] }
                ]
              }
            },
            avgInternalTemp: {
              $avg: {
                $cond: [{ $eq: ["$metadata.sensorType", "internal_temp"] }, "$value", null]
              }
            },
            avgExternalTemp: {
              $avg: {
                $cond: [{ $eq: ["$metadata.sensorType", "external_temp"] }, "$value", null]
              }
            },
            avgPowerKW: {
              $avg: {
                $cond: [
                  { $eq: ["$metadata.sensorType", "energy_meter"] },
                  {
                    $cond: [{ $eq: ["$unit", "W"] }, { $divide: ["$value", 1000] }, "$value"]
                  },
                  null
                ]
              }
            }
          }
        },
        { $sort: { _id: 1 } },
        // 3. Window Fields (Get Prev Values)
        {
          $setWindowFields: {
            sortBy: { _id: 1 },
            output: {
              prevTimestamp: { $shift: { output: "$_id", by: -1 } },
              prevInternalTemp: { $shift: { output: "$avgInternalTemp", by: -1 } },
              prevExternalTemp: { $shift: { output: "$avgExternalTemp", by: -1 } }
            }
          }
        },
        // 4. Calculate Derivatives & Physics Variables
        {
          $project: {
            avgInternalTemp: 1,
            avgExternalTemp: 1,
            avgPowerKW: 1,
            dt_seconds: {
              $divide: [{ $subtract: ["$_id", "$prevTimestamp"] }, 1000]
            },
            tempChange: { $subtract: ["$avgInternalTemp", "$prevInternalTemp"] },
            avgInternal: { $avg: ["$avgInternalTemp", "$prevInternalTemp"] },
            // Fill missing external temp with previous if null
            avgExternal: { $ifNull: ["$avgExternalTemp", "$prevExternalTemp"] },
            powerWatts: { $multiply: ["$avgPowerKW", 1000] }
          }
        },
        // Filter out invalid time steps
        { $match: { dt_seconds: { $gt: 0 } } },
        // 5. Calculate Rates and H_est
        {
          $addFields: {
            tempChangeRate: { $divide: ["$tempChange", "$dt_seconds"] },
            tempDiff: { $subtract: ["$avgInternal", "$avgExternal"] },
            C: ROOM_HEAT_CAPACITY
          }
        },
        {
          $addFields: {
            // Estimate H (Heat Loss Coefficient) only during Cooling Phases
            // Cooling: Power < 10W, Temp Dropping < 0, TempDiff > 2
            H_est: {
              $cond: {
                if: {
                  $and: [
                    { $lt: ["$powerWatts", 10] },
                    { $lt: ["$tempChangeRate", 0] },
                    { $gt: [{ $abs: "$tempDiff" }, 2] },
                    { $ne: ["$tempDiff", 0] }
                  ]
                },
                then: {
                  $divide: [
                    { $multiply: [-1, "$C", "$tempChangeRate"] },
                    "$tempDiff"
                  ]
                },
                else: null
              }
            },
            // Identify Heating Phase candidates
            isHeating: {
              $cond: {
                if: { $gt: ["$powerWatts", 100] },
                then: true,
                else: false
              }
            }
          }
        },
        // 6. Global Aggregation
        {
          $group: {
            _id: null,
            avgH: { $avg: "$H_est" },
            // Collect heating buckets to calculate COP later
            heatingBuckets: {
              $push: {
                $cond: {
                  if: "$isHeating",
                  then: {
                    C: "$C",
                    tempChangeRate: "$tempChangeRate",
                    tempDiff: "$tempDiff",
                    powerWatts: "$powerWatts"
                  },
                  else: "$$REMOVE"
                }
              }
            },
            // Legacy Metrics
            totalEnergyConsumed: { 
              $sum: { 
                $multiply: ["$avgPowerKW", { $divide: ["$dt_seconds", 3600] }] 
              } 
            },
            totalTempChange: { $sum: "$tempChange" },
            avgInternalTempForCarnot: { $avg: "$avgInternalTemp" },
            avgExternalTemp: { $avg: "$avgExternal" }
          }
        },
        // 7. Calculate Average COP using the calculated avgH
        {
          $project: {
            avgH: 1,
            totalEnergyConsumed: { $round: ["$totalEnergyConsumed", 2] },
            totalTempChange: { $round: ["$totalTempChange", 2] },
            avgInternalTempForCarnot: 1,
            avgExternalTemp: 1,
            averageCop: {
              $avg: {
                $map: {
                  input: "$heatingBuckets",
                  as: "b",
                  in: {
                    $divide: [
                      {
                        $add: [
                          { $multiply: ["$$b.C", "$$b.tempChangeRate"] },
                          { $multiply: ["$avgH", "$$b.tempDiff"] }
                        ]
                      },
                      "$$b.powerWatts"
                    ]
                  }
                }
              }
            }
          }
        }
      ];

      const aggResult = await SensorReading.aggregate(pipeline);
      const metrics = aggResult[0] || {};

      // Legacy Fallbacks
      let averageExternalTemperature = metrics.avgExternalTemp || null;
      if (averageExternalTemperature === null) {
        const coords = await getCoordinates(building.address);
        if (coords) {
          averageExternalTemperature = await getAverageHistoricalTemperature(
            coords.lat,
            coords.lon,
            start,
            end
          );
        }
      }

      // Efficiency Index
      let efficiencyIndex: number | null = null;
      if ((metrics.totalTempChange || 0) > 0.1 && (metrics.totalEnergyConsumed || 0) > 0 && building.surface > 0) {
        efficiencyIndex = metrics.totalEnergyConsumed / (metrics.totalTempChange * building.surface);
      }

      // Theoretical COP
      let theoreticalCop: number | null = null;
      if (metrics.avgInternalTempForCarnot && averageExternalTemperature !== null) {
        const tHotK = metrics.avgInternalTempForCarnot + 273.15;
        const tColdK = averageExternalTemperature + 273.15;
        if (tHotK > tColdK) {
          theoreticalCop = tHotK / (tHotK - tColdK);
        }
      }

      return c.json({
        buildingId: building._id.toString(),
        buildingName: building.name,
        period: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
        metrics: {
          totalEnergyConsumed: metrics.totalEnergyConsumed || 0,
          temperatureChange: metrics.totalTempChange || 0,
          averageExternalTemperature: averageExternalTemperature !== null 
            ? Number(averageExternalTemperature.toFixed(2)) 
            : null,
          efficiencyIndex: efficiencyIndex !== null 
            ? Number(efficiencyIndex.toFixed(2)) 
            : null,
          theoreticalCop: theoreticalCop !== null
            ? Number(theoreticalCop.toFixed(2))
            : null,
          estimatedHeatLossCoefficient: metrics.avgH ? Number(metrics.avgH.toFixed(2)) : null,
          averageCop: metrics.averageCop ? Number(metrics.averageCop.toFixed(2)) : null
        },
      });
    }
  );

export default app;
export type AppType = typeof app;
