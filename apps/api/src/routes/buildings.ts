import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Types, type QueryFilter } from "mongoose";
import type { AuthVariables } from "../middleware/auth";
import { Building, type BuildingDocument } from "../models/Building";
import { BuildingType, type HydratedBuildingType } from "../models/BuildingType";
import { Sensor } from "../models/Sensor";
import { SensorReading, type SensorReadingDocument } from "../models/SensorReading";
import {
  toBuildingSummaryDTO,
  toBuildingDetailDTO,
} from "../lib/buildings";

import { apiError, apiSuccess } from "../lib/api-response";
import {
  SearchBuildingsQuerySchema,
  SearchBuildingsResponseSchema,
  CreateBuildingRequestSchema,
  BuildingResponseSchema,
  GetBuildingParamsSchema,
  UpdateBuildingParamsSchema,
  UpdateBuildingRequestSchema,
  DeleteBuildingParamsSchema,
  GetBuildingHistoryQuerySchema,
  GetBuildingHistoryResponseSchema,
  GetBuildingEfficiencyQuerySchema,
  GetBuildingEfficiencyResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  BuildingResponse,
  GetBuildingEfficiencyResponse,
  GetBuildingHistoryResponse,
  SearchBuildingsResponse,
  ErrorResponse,
} from "@wattguard/shared";
import { calculateBuildingEfficiency } from "../lib/efficiency";
import { isDistrictHeatingBuilding } from "../lib/energy";
import { deleteForBuilding, resolveEfficiencyForBuilding } from "../lib/alerts";

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      summary: "Search buildings",
      description: "Searches buildings with filters, pagination and sorting",
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
        400: {
          description: "Invalid query parameters",
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
      },
    }),
    validator("query", SearchBuildingsQuerySchema),
    async (c) => {
      const query = c.req.valid("query");

      const filter: QueryFilter<BuildingDocument> = {};

      if (query.name) {
        filter.name = { $regex: query.name, $options: "i" };
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
      const sort = { [sortBy]: sortOrder } satisfies Record<string, 1 | -1>;

      // Execute query with pagination
      const buildings = await Building.find(filter)
        .populate<{ buildingType: HydratedBuildingType }>("buildingType", "name description")
        .sort(sort)
        .limit(query.limit)
        .skip(query.offset);

      // Enrich with active sensor counts and current consumption
      const buildingIds = buildings.map((b) => b._id);

      // Count active sensors per building
      const sensorCounts = await Sensor.aggregate<{
        _id: Types.ObjectId;
        count: number;
      }>([
        { $match: { building: { $in: buildingIds }, status: "active" } },
        { $group: { _id: "$building", count: { $sum: 1 } } },
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
            building: { $in: buildingIds },
            sensorType: "energy_meter",
            status: "active",
            "lastReading.value": { $exists: true },
          },
        },
        { $sort: { "lastReading.timestamp": -1 } },
        {
          $group: {
            _id: "$building",
            value: { $first: "$lastReading.value" },
          },
        },
      ]);

      const consumptionMap = new Map(
        energySensors.map((s) => [s._id.toString(), s.value])
      );

      return c.json(apiSuccess({
        buildings: buildings.map((b) =>
          toBuildingSummaryDTO(b, {
            activeSensors: sensorCountMap.get(b._id.toString()) ?? 0,
            currentConsumption: consumptionMap.get(b._id.toString()) ?? null,
          })
        ),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total,
        },
      }) satisfies SearchBuildingsResponse);
    }
  )
  .post(
    "/",
    describeRoute({
      summary: "Create building",
      description: "Creates a new building after validating type and plant",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        201: {
          description: "Building created successfully",
          content: {
            "application/json": {
              schema: resolver(BuildingResponseSchema),
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
        422: {
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
      },
    }),
    validator("json", CreateBuildingRequestSchema),
    async (c) => {
      const userDoc = c.get("userDoc");
      const data = c.req.valid("json");

      // Verify building type exists
      const buildingType = await BuildingType.findById(data.buildingType);
      if (!buildingType) {
        return c.json(apiError("building_type_not_found", "Building type not found") satisfies ErrorResponse, 422);
      }

      if (isDistrictHeatingBuilding(data.heatingSystemType) && data.efficiencyThresholds?.enabled) {
        return c.json(apiError("generic", "Efficiency thresholds are not available for district heating buildings") satisfies ErrorResponse, 422);
      }

      // Create building
      const building = new Building({
        ...data,
        buildingType: new Types.ObjectId(data.buildingType),
        efficiencyThresholds: data.efficiencyThresholds ?? { enabled: false, minCop: null },
        createdBy: userDoc._id,
        updatedBy: userDoc._id,
      });

      await building.save();
      
      c.header("Location", `${c.req.path}/${building._id.toString()}`);

      return c.json(
        apiSuccess(toBuildingDetailDTO(building, {
          activeSensors: 0,
          currentConsumption: null,
        })) satisfies BuildingResponse,
        201
      );
    }
  )
  .get(
    "/:id",
    describeRoute({
      summary: "Get building",
      description: "Returns detail with active sensors and consumption",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Building details retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(BuildingResponseSchema),
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

      const building = await Building.findById(id)
        .populate<{ buildingType: HydratedBuildingType }>("buildingType", "name description");

      if (!building) {
        return c.json(apiError("building_not_found", "Building not found") satisfies ErrorResponse, 404);
      }

      // Enrich with active sensor count and current consumption
      const [activeSensorsCount, energySensor] = await Promise.all([
        Sensor.countDocuments({
          building: building._id,
          status: "active",
        }),
        Sensor.findOne({
          building: building._id,
          sensorType: "energy_meter",
          status: "active",
          "lastReading.value": { $exists: true },
        }).sort({ "lastReading.timestamp": -1 }),
      ]);

      return c.json(apiSuccess(toBuildingDetailDTO(building, {
        activeSensors: activeSensorsCount,
        currentConsumption: energySensor?.lastReading?.value ?? null,
      })) satisfies BuildingResponse);
    }
  )
  .patch(
    "/:id",
    describeRoute({
      summary: "Update building",
      description: "Updates data and handles efficiency/district-heating thresholds",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Building updated successfully",
          content: {
            "application/json": {
              schema: resolver(BuildingResponseSchema),
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
        422: {
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
          description: "Building not found",
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
        return c.json(apiError("building_not_found", "Building not found") satisfies ErrorResponse, 404);
      }

      // If buildingType is being updated, verify it exists
      if (updates.buildingType) {
        const buildingType = await BuildingType.findById(updates.buildingType);
        if (!buildingType) {
          return c.json(apiError("building_type_not_found", "Building type not found") satisfies ErrorResponse, 422);
        }
      }

      const resultingDistrictHeating = isDistrictHeatingBuilding(
        updates.heatingSystemType ?? building.heatingSystemType,
      );

      if (resultingDistrictHeating && updates.efficiencyThresholds !== undefined) {
        return c.json(apiError("generic", "Efficiency thresholds are not available for district heating buildings") satisfies ErrorResponse, 422);
      }

      if (resultingDistrictHeating && building.efficiencyThresholds.enabled) {
        // Passaggio a teleriscaldamento: azzera la config e risolve gli alert efficienza.
        building.efficiencyThresholds = { enabled: false, minCop: null };
        await resolveEfficiencyForBuilding({
          buildingId: building._id,
          actor: userDoc.name || userDoc.email,
        });
      }

      // Apply updates cleanly
      const { buildingType: newType, ...restUpdates } = updates;
      Object.assign(building, restUpdates);
      if (newType !== undefined) {
        building.buildingType = new Types.ObjectId(newType);
      }

      if (updates.efficiencyThresholds !== undefined && !updates.efficiencyThresholds.enabled) {
        // Disabilitazione soglie: risolve gli alert efficienza ancora aperti.
        await resolveEfficiencyForBuilding({
          buildingId: building._id,
          actor: userDoc.name || userDoc.email,
        });
      }

      building.updatedBy = userDoc._id;

      await building.save();

      // Populate for response
      const populatedBuilding = await building.populate<{ buildingType: HydratedBuildingType }>(
        "buildingType",
        "name description"
      );

      // Enrich with active sensor count and current consumption
      const [activeSensorsCount, energySensor] = await Promise.all([
        Sensor.countDocuments({
          building: building._id,
          status: "active",
        }),
        Sensor.findOne({
          building: building._id,
          sensorType: "energy_meter",
          status: "active",
          "lastReading.value": { $exists: true },
        }).sort({ "lastReading.timestamp": -1 }),
      ]);

      return c.json(apiSuccess(toBuildingDetailDTO(populatedBuilding, {
        activeSensors: activeSensorsCount,
        currentConsumption: energySensor?.lastReading?.value ?? null,
      })) satisfies BuildingResponse);
    }
  )
  .delete(
    "/:id",
    describeRoute({
      summary: "Delete building",
      description: "Deletes building with associated sensors, readings and alerts",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        204: {
          description: "Building and associated data deleted successfully",
        },
        400: {
          description: "Invalid ID parameter",
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
    validator("param", DeleteBuildingParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");

      const building = await Building.findById(id);
      if (!building) {
        return c.json(apiError("building_not_found", "Building not found") satisfies ErrorResponse, 404);
      }

      // Cascade delete readings and alerts for this building
      await SensorReading.deleteMany({ "metadata.building": id });
      await deleteForBuilding(new Types.ObjectId(id));
      await Sensor.deleteMany({
        building: id,
      });
      await Building.findByIdAndDelete(id);

      return c.body(null, 204);
    }
  )
  .get(
    "/:id/readings",
    describeRoute({
      summary: "Get reading history",
      description: "Returns history for a date range, for charts. Use limit=1&sortOrder=desc for the latest reading",
      tags: ["Buildings"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Historical readings retrieved successfully",
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
      const { startDate, endDate, sensorType, limit, sortOrder } = c.req.valid("query");

      const building = await Building.findById(id);
      if (!building) {
        return c.json(apiError("building_not_found", "Building not found") satisfies ErrorResponse, 404);
      }

      // Build query for sensor readings
      const query: QueryFilter<SensorReadingDocument> = {
        "metadata.building": id,
        timestamp: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };

      if (sensorType) {
        query["metadata.sensorType"] = sensorType;
      }

      // Query historical data from time-series collection.
      // limit=1&sortOrder=desc returns the latest point (replaces readings/latest).
      const readings = await SensorReading.find(query)
        .sort({ timestamp: sortOrder === "desc" ? -1 : 1 })
        .limit(limit);

      return c.json(apiSuccess({
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
          sensorId: r.metadata.sensor?.toString(),
        })),
      }) satisfies GetBuildingHistoryResponse);
    }
  )
  .get(
    "/:id/efficiency",
    describeRoute({
      summary: "Calculate efficiency",
      description: "Calculates the building thermal efficiency over the requested period",
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
        return c.json(apiError("building_not_found", "Building not found") satisfies ErrorResponse, 404);
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      const metrics = await calculateBuildingEfficiency(building, start, end);

      return c.json(apiSuccess({
        buildingId: building._id.toString(),
        buildingName: building.name,
        period: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
        metrics,
      }) satisfies GetBuildingEfficiencyResponse);
    }
  );

export default app;
export type AppType = typeof app;
