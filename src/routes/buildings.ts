import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import mongoose, { Types, type QueryFilter } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { Building, type BuildingDocument } from "../models/Building";
import { BuildingType } from "../models/BuildingType";
import { Sensor, type SensorDocument, type SensorType } from "../models/Sensor";
import { SensorReading, type SensorReadingDocument } from "../models/SensorReading";
import { Alert } from "../models/Alert";

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
  GetBuildingRealTimeResponseSchema,
  GetBuildingHistoryQuerySchema,
  GetBuildingHistoryResponseSchema,
  GetBuildingEfficiencyQuerySchema,
  GetBuildingEfficiencyResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  CreateBuildingResponse,
  DeleteBuildingResponse,
  GetBuildingEfficiencyResponse,
  GetBuildingHistoryResponse,
  GetBuildingRealTimeResponse,
  GetBuildingResponse,
  SearchBuildingsResponse,
  UpdateBuildingResponse,
} from "@wattguard/shared";
import { getAverageHistoricalTemperature } from "../lib/weather";

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

      const filter: QueryFilter<BuildingDocument> = {};

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
        .populate<{ buildingType: { _id: Types.ObjectId; name: string; description: string } }>("buildingType", "name description")
        .sort(sort)
        .limit(query.limit)
        .skip(query.offset)
        .lean();

      // Enrich with active sensor counts and current consumption
      const buildingIds = buildings.map((b) => b._id);

      // Count active sensors per building
      const sensorCounts = await Sensor.aggregate<{
        _id: Types.ObjectId;
        count: number;
      }>([
        { $match: { buildingId: { $in: buildingIds }, status: "active" } },
        { $group: { _id: "$buildingId", count: { $sum: 1 } } },
      ]);

      const sensorCountMap = new Map(
        sensorCounts.map((s) => [s._id.toString(), s.count])
      );

      // Get latest energy_meter reading per building (from sensor lastReading)
      const energySensors = await Sensor.aggregate<{
        _id: Types.ObjectId;
        value: number;
      }>([
        {
          $match: {
            buildingId: { $in: buildingIds },
            sensorType: "energy_meter",
            status: "active",
            "lastReading.value": { $exists: true },
          },
        },
        { $sort: { "lastReading.timestamp": -1 } },
        {
          $group: {
            _id: "$buildingId",
            value: { $first: "$lastReading.value" },
          },
        },
      ]);

      const consumptionMap = new Map(
        energySensors.map((s) => [s._id.toString(), s.value])
      );

      return c.json({
        buildings: buildings.map((b) => {
          const buildingType = b.buildingType;
          const bid = b._id.toString();
          return {
            id: bid,
            name: b.name,
            address: b.address,
            surface: b.surface,
            ceilingHeight: b.ceilingHeight,
            location: {
              type: b.location.type,
              coordinates: b.location.coordinates as [number, number],
            },
            buildingType: (buildingType instanceof mongoose.Types.ObjectId)
              ? buildingType.toString()
              : {
                  id: buildingType._id.toString(),
                  name: buildingType.name,
                  description: buildingType.description ?? undefined,
                },
            heatingSystemType: b.heatingSystemType,
            status: b.status,
            geographicZone: b.geographicZone,
            activeSensors: sensorCountMap.get(bid) ?? 0,
            currentConsumption: consumptionMap.get(bid) ?? null,
            updatedAt: b.updatedAt?.toISOString(),
          };
        }),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total,
        },
      } satisfies SearchBuildingsResponse);
    }
  )
  .post(
    "/",
    describeRoute({
      description: "Create a new building",
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

      const buildingType = await BuildingType.findById(buildingData.buildingType).lean();

      if (!buildingType) {
        return c.json({ error: "Building type not found" }, 404);
      }

      const building = new Building({
        ...buildingData,
        createdBy: userDoc._id,
        updatedBy: userDoc._id,
      });

      await building.save();

      return c.json({
        success: true,
        building: {
          id: building._id.toString(),
          name: building.name,
          address: building.address,
          surface: building.surface,
          ceilingHeight: building.ceilingHeight,
          location: {
            type: building.location.type,
            coordinates: building.location.coordinates as [number, number],
          },
          buildingType: {
            id: buildingType._id.toString(),
            name: buildingType.name,
            description: buildingType.description ?? undefined,
          },
          heatingSystemType: building.heatingSystemType,
          status: building.status,
          geographicZone: building.geographicZone,
          activeSensors: 0,
          currentConsumption: null,
          constructionYear: building.constructionYear ?? undefined,
          createdBy: building.createdBy.toString(),
          updatedBy: building.updatedBy.toString(),
          createdAt: building.createdAt?.toISOString(),
          updatedAt: building.updatedAt?.toISOString(),
        },
      } satisfies CreateBuildingResponse, 201);
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

      const building = await Building.findById(id).populate<{
        buildingType: {
          _id: Types.ObjectId;
          name: string;
          description?: string | null;
        };
      }>("buildingType", "name description").lean();

      if (!building) {
        return c.json({ error: "Building not found" }, 404);
      }

      const bt = building.buildingType;

      // Enrich with active sensor count and current consumption
      const [activeSensorsCount, energySensor] = await Promise.all([
        Sensor.countDocuments({ buildingId: building._id, status: "active" }),
        Sensor.findOne({
          buildingId: building._id,
          sensorType: "energy_meter",
          status: "active",
          "lastReading.value": { $exists: true },
        }).sort({ "lastReading.timestamp": -1 }),
      ]);

      return c.json({
        building: {
          id: building._id.toString(),
          name: building.name,
          address: building.address,
          surface: building.surface,
          ceilingHeight: building.ceilingHeight,
          location: {
            type: building.location.type,
            coordinates: building.location.coordinates as [number, number],
          },
          buildingType: {
            id: bt._id.toString(),
            name: bt.name,
            description: bt.description ?? undefined,
          },
          heatingSystemType: building.heatingSystemType,
          status: building.status,
          geographicZone: building.geographicZone,
          activeSensors: activeSensorsCount,
          currentConsumption: energySensor?.lastReading?.value ?? null,
          constructionYear: building.constructionYear ?? undefined,
          createdBy: building.createdBy.toString(),
          updatedBy: building.updatedBy.toString(),
          createdAt: building.createdAt?.toISOString(),
          updatedAt: building.updatedAt?.toISOString(),
        },
      } satisfies GetBuildingResponse);
    }
  )

  /**
   * PATCH /api/buildings/:id - Update a building
   */
  .patch(
    "/:id",
    describeRoute({
      description: "Update a building",
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
      if (updates.ceilingHeight !== undefined) building.ceilingHeight = updates.ceilingHeight;
      if (updates.location !== undefined) building.location = updates.location;
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
      const populatedBuilding = await building.populate<{
        buildingType: {
          _id: Types.ObjectId;
          name: string;
          description?: string | null;
        };
      }>("buildingType", "name description");
      const bt = populatedBuilding.buildingType;

      // Enrich with active sensor count and current consumption
      const [activeSensorsCount, energySensor] = await Promise.all([
        Sensor.countDocuments({ buildingId: building._id, status: "active" }),
        Sensor.findOne({
          buildingId: building._id,
          sensorType: "energy_meter",
          status: "active",
          "lastReading.value": { $exists: true },
        }).sort({ "lastReading.timestamp": -1 }),
      ]);

      return c.json({
        success: true,
        building: {
          id: building._id.toString(),
          name: building.name,
          address: building.address,
          surface: building.surface,
          ceilingHeight: building.ceilingHeight,
          location: {
            type: building.location.type,
            coordinates: building.location.coordinates as [number, number],
          },
          buildingType: {
            id: bt._id.toString(),
            name: bt.name,
            description: bt.description ?? undefined,
          },
          heatingSystemType: building.heatingSystemType,
          status: building.status,
          geographicZone: building.geographicZone,
          activeSensors: activeSensorsCount,
          currentConsumption: energySensor?.lastReading?.value ?? null,
          constructionYear: building.constructionYear ?? undefined,
          createdBy: building.createdBy.toString(),
          updatedBy: building.updatedBy.toString(),
          createdAt: building.createdAt?.toISOString(),
          updatedAt: building.updatedAt?.toISOString(),
        },
      } satisfies UpdateBuildingResponse);
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
      await Promise.all([
        SensorReading.deleteMany({ "metadata.buildingId": new Types.ObjectId(id) }),
        Alert.deleteMany({ buildingId: id }),
        Sensor.deleteMany({ buildingId: id }),
        building.deleteOne(),
      ]);

      return c.json({
        success: true,
        message: "Building and associated data deleted successfully",
      } satisfies DeleteBuildingResponse);
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
      const internalTempSensor = sensors.find((s: SensorDocument) => s.sensorType === "internal_temp");
      const externalTempSensor = sensors.find((s: SensorDocument) => s.sensorType === "external_temp");
      const energyMeterSensor = sensors.find((s: SensorDocument) => s.sensorType === "energy_meter");

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
      } satisfies GetBuildingRealTimeResponse);
    }
  )
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
      const query: QueryFilter<SensorReadingDocument> = {
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
          sensorType: r.metadata!.sensorType as SensorType,
          sensorId: r.metadata!.sensorId?.toString(),
        })),
      } satisfies GetBuildingHistoryResponse);
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

      // ── Heating system classification ──────────────────────────────────────
      const heatingType = building.heatingSystemType.toLowerCase();
      const isGasBoiler = heatingType.includes("gas")
        || heatingType.includes("caldaia")
        || heatingType.includes("centralizzato");
      const isDistrictHeating = heatingType.includes("teleriscaldamento")
        || heatingType.includes("district");

      // Natural gas lower heating value (Italy standard)
      const GAS_LHV_KWH_PER_M3 = 10.55;

      // Physics Constants (for COP / heat-loss estimation)
      const CEILING_HEIGHT = building.ceilingHeight || 3.0; // meters (fallback to default)
      const AIR_DENSITY = 1.225; // kg/m³
      const SPECIFIC_HEAT_AIR = 1005; // J/(kg·K)
      const ROOM_HEAT_CAPACITY = building.surface * CEILING_HEIGHT * AIR_DENSITY * SPECIFIC_HEAT_AIR;

      // ── Sensor match ───────────────────────────────────────────────────────
      // Gas boiler buildings use gas_meter instead of energy_meter.
      const energySensorType = isGasBoiler ? "gas_meter" : "energy_meter";
      const sensorMatch = {
        "metadata.buildingId": new Types.ObjectId(id),
        timestamp: { $gte: start, $lte: end },
        "metadata.sensorType": { $in: [energySensorType, "internal_temp", "external_temp"] }
      };

      // ── Gas pre-aggregation ────────────────────────────────────────────────
      // For gas boiler buildings only: convert cumulative m³ readings into
      // per-minute average fuel power (kW), used by the physics pipeline.
      // Formula: power_kW = deltaM3 / deltaTHours × GAS_LHV_KWH_PER_M3
      type GasBucket = { _id: Date; avgGasPowerKW: number };
      let gasPowerByMinute = new Map<string, number>(); // minuteISO → kW

      if (isGasBoiler) {
        const gasReadings: GasBucket[] = await SensorReading.aggregate([
          {
            $match: {
              "metadata.buildingId": new Types.ObjectId(id),
              timestamp: { $gte: start, $lte: end },
              "metadata.sensorType": "gas_meter",
            }
          },
          { $sort: { timestamp: 1 } },
          {
            $setWindowFields: {
              sortBy: { timestamp: 1 },
              output: {
                prevValue:     { $shift: { output: "$value",     by: -1 } },
                prevTimestamp: { $shift: { output: "$timestamp", by: -1 } }
              }
            }
          },
          // Drop the first document (no previous reading → no delta)
          { $match: { prevValue: { $exists: true } } },
          {
            $addFields: {
              deltaM3: { $subtract: ["$value", "$prevValue"] },
              deltaTHours: {
                $divide: [
                  { $subtract: [{ $toLong: "$timestamp" }, { $toLong: "$prevTimestamp" }] },
                  3600000
                ]
              },
              minuteBucket: {
                $toDate: {
                  $subtract: [
                    { $toLong: "$timestamp" },
                    { $mod: [{ $toLong: "$timestamp" }, 60000] }
                  ]
                }
              }
            }
          },
          // Discard negatives (meter resets) and zero-duration intervals
          { $match: { deltaM3: { $gte: 0 }, deltaTHours: { $gt: 0 } } },
          {
            $addFields: {
              // Convert m³ flow rate to kW of fuel energy input
              gasPowerKW: {
                $multiply: [
                  { $divide: ["$deltaM3", "$deltaTHours"] },
                  GAS_LHV_KWH_PER_M3
                ]
              }
            }
          },
          {
            $group: {
              _id: "$minuteBucket",
              avgGasPowerKW: { $avg: "$gasPowerKW" }
            }
          }
        ]);

        gasPowerByMinute = new Map(
          gasReadings.map((r) => [r._id.toISOString(), r.avgGasPowerKW])
        );
      }

      // ── Aggregation 1: Basic metrics ────────────────────────────────────────
      // For gas buildings: totalEnergyConsumed = (lastM3 − firstM3) × GAS_LHV_KWH_PER_M3
      // For others: avgPowerKW × elapsed hours.
      let totalEnergyConsumed = 0;
      let avgExternalTempFromBasic: number | null;

      if (isGasBoiler) {
        // Fetch first and last gas_meter readings in the period
        const [firstGas] = await SensorReading.find({
          "metadata.buildingId": new Types.ObjectId(id),
          timestamp: { $gte: start, $lte: end },
          "metadata.sensorType": "gas_meter",
        }).sort({ timestamp: 1 }).limit(1);

        const [lastGas] = await SensorReading.find({
          "metadata.buildingId": new Types.ObjectId(id),
          timestamp: { $gte: start, $lte: end },
          "metadata.sensorType": "gas_meter",
        }).sort({ timestamp: -1 }).limit(1);

        if (firstGas && lastGas && lastGas.value >= firstGas.value) {
          const consumedM3 = lastGas.value - firstGas.value;
          totalEnergyConsumed = Number((consumedM3 * GAS_LHV_KWH_PER_M3).toFixed(2));
        }

        // External temperature average for gas buildings
        const [extResult] = await SensorReading.aggregate([
          {
            $match: {
              "metadata.buildingId": new Types.ObjectId(id),
              timestamp: { $gte: start, $lte: end },
              "metadata.sensorType": "external_temp",
            }
          },
          { $group: { _id: null, avg: { $avg: "$value" } } }
        ]);
        avgExternalTempFromBasic = extResult?.avg ?? null;

      } else {
        const [basicResult] = await SensorReading.aggregate([
          { $match: sensorMatch },
          {
            $group: {
              _id: null,
              avgPowerKW: {
                $avg: {
                  $cond: [
                    { $eq: ["$metadata.sensorType", "energy_meter"] },
                    // Normalise W → kW; values already in kW pass through as-is
                    { $cond: [{ $eq: ["$unit", "W"] }, { $divide: ["$value", 1000] }, "$value"] },
                    null
                  ]
                }
              },
              avgExternalTemp: {
                $avg: {
                  $cond: [{ $eq: ["$metadata.sensorType", "external_temp"] }, "$value", null]
                }
              },
              minTimestamp: { $min: "$timestamp" },
              maxTimestamp: { $max: "$timestamp" }
            }
          },
          {
            $project: {
              avgExternalTemp: 1,
              totalEnergyConsumed: {
                $round: [
                  {
                    $multiply: [
                      "$avgPowerKW",
                      { $divide: [{ $subtract: ["$maxTimestamp", "$minTimestamp"] }, 3600000] }
                    ]
                  },
                  2
                ]
              },
            }
          }
        ]);

        totalEnergyConsumed = basicResult?.totalEnergyConsumed ?? 0;
        avgExternalTempFromBasic = basicResult?.avgExternalTemp ?? null;
      }

      // ── Aggregation 2: Physics metrics (COP & heat-loss) ────────────────────
      // Requires ≥ 2 one-minute buckets with consecutive time deltas.
      // For gas buildings: powerWatts comes from the gas pre-aggregation map (joined in app code).
      // For other buildings: powerWatts comes from energy_meter readings in the bucket.
      // Returns null for avgH / averageCop when no cooling phases are detected.

      // Match only temperature sensors for gas buildings (energy handled separately above)
      const physicsSensorMatch = isGasBoiler
        ? {
            "metadata.buildingId": new Types.ObjectId(id),
            timestamp: { $gte: start, $lte: end },
            "metadata.sensorType": { $in: ["internal_temp", "external_temp"] }
          }
        : sensorMatch;

      type PhysicsBucket = {
        _id: Date;
        avgInternalTemp: number | null;
        avgExternalTemp: number | null;
        avgPowerKW: number | null;
      };

      const tempBuckets: PhysicsBucket[] = await SensorReading.aggregate([
        { $match: physicsSensorMatch },
        {
          $group: {
            _id: {
              $toDate: {
                $subtract: [
                  { $toLong: "$timestamp" },
                  { $mod: [{ $toLong: "$timestamp" }, 1 * 60 * 1000] }
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
                  { $cond: [{ $eq: ["$unit", "W"] }, { $divide: ["$value", 1000] }, "$value"] },
                  null
                ]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // For gas buildings: inject gas power from the pre-aggregation map
      if (isGasBoiler) {
        for (const bucket of tempBuckets) {
          const key = bucket._id.toISOString();
          const gasPowerKW = gasPowerByMinute.get(key) ?? null;
          bucket.avgPowerKW = gasPowerKW;
        }
      }

      // Weather API fallback for external temperature
      const hasSensorExternalTemp = tempBuckets.some((b) => b.avgExternalTemp !== null)
        || avgExternalTempFromBasic !== null;

      let weatherFallbackExtTemp: number | null = null;
      if (!hasSensorExternalTemp) {
        weatherFallbackExtTemp = await getAverageHistoricalTemperature(
          building.location.coordinates[1]!,
          building.location.coordinates[0]!,
          start,
          end
        );
      }

      // Compute physics (H_est, COP) in application code from the per-minute buckets
      let avgH: number | null = null;
      let averageCop: number | null = null;

      if (tempBuckets.length >= 2) {
        const C = ROOM_HEAT_CAPACITY;
        const hEstimates: number[] = [];
        const copValues: number[] = [];

        for (let i = 1; i < tempBuckets.length; i++) {
          const prev = tempBuckets[i - 1]!;
          const curr = tempBuckets[i]!;

          if (curr.avgInternalTemp === null || prev.avgInternalTemp === null) continue;

          const dtSeconds = (curr._id.getTime() - prev._id.getTime()) / 1000;
          if (dtSeconds <= 0) continue;

          const tempChange     = curr.avgInternalTemp - prev.avgInternalTemp;
          const tempChangeRate = tempChange / dtSeconds;
          const avgInternal    = (curr.avgInternalTemp + prev.avgInternalTemp) / 2;
          // Fall back to weather API temperature when no external_temp sensor data
          // is available for either the current or previous bucket.
          const avgExternal    = curr.avgExternalTemp ?? prev.avgExternalTemp ?? weatherFallbackExtTemp ?? null;
          const tempDiff       = avgExternal !== null ? avgInternal - avgExternal : null;
          const powerWatts     = curr.avgPowerKW !== null ? curr.avgPowerKW * 1000 : null;

          // H_est: only during natural cooling (heater off, temp falling, meaningful ΔT)
          if (
            powerWatts !== null && powerWatts < 10 &&
            tempChangeRate < 0 &&
            tempDiff !== null && Math.abs(tempDiff) > 2
          ) {
            const hEst = (-1 * C * tempChangeRate) / tempDiff;
            hEstimates.push(hEst);
          }

          // COP: only during heating (power > 100 W)
          if (
            powerWatts !== null && powerWatts > 100 &&
            tempDiff !== null
          ) {
            // avgH may not be computed yet — use best estimate so far (or 0 if none)
            // We'll do a second pass after avgH is determined
            copValues.push({ C, tempChangeRate, tempDiff, powerWatts } as unknown as number);
          }
        }

        if (hEstimates.length > 0) {
          avgH = hEstimates.reduce((a, b) => a + b, 0) / hEstimates.length;
        }

        // Second pass for COP now that avgH is known
        if (avgH !== null && copValues.length > 0) {
          const cops = (copValues as unknown as { C: number; tempChangeRate: number; tempDiff: number; powerWatts: number }[])
            .map(({ C: c, tempChangeRate, tempDiff, powerWatts }) =>
              (c * tempChangeRate + avgH! * tempDiff) / powerWatts
            );
          averageCop = cops.reduce((a, b) => a + b, 0) / cops.length;
        }
      }

      // Fallback for average external temperature if not provided by sensors or basic aggregation: use weather API value
      let averageExternalTemperature: number | null = avgExternalTempFromBasic;
      if (averageExternalTemperature === null) {
        averageExternalTemperature = weatherFallbackExtTemp ?? await getAverageHistoricalTemperature(
          building.location.coordinates[1]!,
          building.location.coordinates[0]!,
          start,
          end
        );
      }

      return c.json({
        buildingId: building._id.toString(),
        buildingName: building.name,
        period: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
        metrics: {
          totalEnergyConsumed,
          averageExternalTemperature: averageExternalTemperature !== null
            ? Number(averageExternalTemperature.toFixed(2))
            : null,
          estimatedHeatLossCoefficient: avgH ? Number(avgH.toFixed(2)) : null,
          insulationQuality: avgH && building.surface > 0
            ? Number((avgH / building.surface).toFixed(2))
            : null,
          // District heating: COP is a plant-level metric, meaningless at building level
          averageCop: isDistrictHeating
            ? null
            : averageCop ? Number(averageCop.toFixed(2)) : null
        },
      } satisfies GetBuildingEfficiencyResponse);
    }
  );

export default app;
export type AppType = typeof app;
