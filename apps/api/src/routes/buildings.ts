import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import mongoose, { Types, type QueryFilter } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { Building, type BuildingDocument } from "../models/Building";
import { BuildingType } from "../models/BuildingType";
import { Sensor, type SensorDocument, type SensorType } from "../models/Sensor";
import { SensorReading, type SensorReadingDocument } from "../models/SensorReading";

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
import { calculateBuildingEfficiency } from "../lib/efficiency";
import { isDistrictHeatingBuilding } from "../lib/consumption";
import { deleteForBuilding, resolveEfficiencyForBuilding } from "../lib/alerts";

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
        return c.json({ error: "Building type not found", code: "building_type_not_found" }, 404);
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
          efficiencyThresholds: {
            enabled: building.efficiencyThresholds.enabled,
            minCop: building.efficiencyThresholds.minCop ?? null,
          },
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
        return c.json({ error: "Building not found", code: "building_not_found" }, 404);
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
          efficiencyThresholds: {
            enabled: building.efficiencyThresholds.enabled,
            minCop: building.efficiencyThresholds.minCop ?? null,
          },
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
        return c.json({ error: "Building not found", code: "building_not_found" }, 404);
      }

      // Validate building type if being updated
      if (updates.buildingType) {
        const buildingType = await BuildingType.findById(updates.buildingType);
        if (!buildingType) {
          return c.json({ error: "Building type not found", code: "building_type_not_found" }, 404);
        }
      }

      const resultingDistrictHeating = isDistrictHeatingBuilding(
        updates.heatingSystemType ?? building.heatingSystemType,
      );

      if (resultingDistrictHeating && updates.efficiencyThresholds !== undefined) {
        return c.json({ error: "Efficiency thresholds are not available for district heating buildings" }, 400);
      }

      if (resultingDistrictHeating && building.efficiencyThresholds.enabled) {
        // Passaggio a teleriscaldamento: azzera la config e risolve gli alert efficienza.
        building.efficiencyThresholds = { enabled: false, minCop: null };
        await resolveEfficiencyForBuilding({
          buildingId: building._id,
          actor: userDoc.name || userDoc.email,
        });
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
      if (updates.efficiencyThresholds !== undefined)
        building.efficiencyThresholds = updates.efficiencyThresholds;

      if (updates.efficiencyThresholds !== undefined && !updates.efficiencyThresholds.enabled) {
        // Disabilitazione soglie: risolve gli alert efficienza ancora aperti.
        await resolveEfficiencyForBuilding({
          buildingId: building._id,
          actor: userDoc.name || userDoc.email,
        });
      }

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
          efficiencyThresholds: {
            enabled: building.efficiencyThresholds.enabled,
            minCop: building.efficiencyThresholds.minCop ?? null,
          },
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
        return c.json({ error: "Building not found", code: "building_not_found" }, 404);
      }

      // Cascade delete: first delete sensor readings, then sensors, then building
      await Promise.all([
        SensorReading.deleteMany({ "metadata.buildingId": new Types.ObjectId(id) }),
        deleteForBuilding(new Types.ObjectId(id)),
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
        return c.json({ error: "Building not found", code: "building_not_found" }, 404);
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
        return c.json({ error: "Building not found", code: "building_not_found" }, 404);
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
        return c.json({ error: "Building not found", code: "building_not_found" }, 404);
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      const metrics = await calculateBuildingEfficiency(building, start, end);

      return c.json({
        buildingId: building._id.toString(),
        buildingName: building.name,
        period: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
        metrics,
      } satisfies GetBuildingEfficiencyResponse);
    }
  );

export default app;
export type AppType = typeof app;
