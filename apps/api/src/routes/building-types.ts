/**
 * Building Types routes
 * 
 * All routes in this file require JWT authentication and admin/operator role.
 * Admin only: POST, PATCH, DELETE (managing building types)
 * Admin + Operator: GET (viewing building types)
 */
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { requireRole, type AuthVariables } from "../middleware/auth";
import { mongo } from "mongoose";
import { BuildingType } from "../models/BuildingType";
import { Building } from "../models/Building";
import { toBuildingTypeDTO } from "../lib/building-types";
import { apiError, apiSuccess } from "../lib/api-response";
import {
  ListBuildingTypesResponseSchema,
  CreateBuildingTypeRequestSchema,
  CreateBuildingTypeResponseSchema,
  UpdateBuildingTypeParamsSchema,
  UpdateBuildingTypeRequestSchema,
  UpdateBuildingTypeResponseSchema,
  DeleteBuildingTypeParamsSchema,
  DeleteBuildingTypeResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  ListBuildingTypesResponse,
  CreateBuildingTypeResponse,
  UpdateBuildingTypeResponse,
  DeleteBuildingTypeResponse,
  ErrorResponse,
} from "@wattguard/shared";

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      description: "List all building types",
      tags: ["Building Types"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Building types retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(ListBuildingTypesResponseSchema),
            },
          },
        },
        401: {
          description: "Unauthorized - Invalid or missing JWT token",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden - Requires admin or operator role",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    async (c) => {
      const buildingTypes = await BuildingType.find().sort({ name: 1 });

      return c.json(apiSuccess(buildingTypes.map((bt) => toBuildingTypeDTO(bt))) satisfies ListBuildingTypesResponse);
    }
  )
  .post(
    "/",
    requireRole("admin"),
    describeRoute({
      description: "Create a new building type (admin only)",
      tags: ["Building Types"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        201: {
          description: "Building type created successfully",
          content: {
            "application/json": {
              schema: resolver(CreateBuildingTypeResponseSchema),
            },
          },
        },
        400: {
          description: "Validation error or duplicate name",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        401: {
          description: "Unauthorized - Invalid or missing JWT token",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden - Requires admin role",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("json", CreateBuildingTypeRequestSchema),
    async (c) => {
      const { name, description } = c.req.valid("json");

      try {
        const buildingType = await BuildingType.create({
          name,
          description,
        });

        c.header("Location", `${c.req.path}/${buildingType._id.toString()}`);

        return c.json(apiSuccess(toBuildingTypeDTO(buildingType)) satisfies CreateBuildingTypeResponse, 201);
      } catch (err: unknown) {
        if (err instanceof mongo.MongoServerError && err.code === 11000) {
          return c.json(apiError("building_type_name_exists", "Building type with this name already exists") satisfies ErrorResponse, 400);
        }
        throw err;
      }
    }
  )
  .patch(
    "/:id",
    requireRole("admin"),
    describeRoute({
      description: "Update a building type (admin only)",
      tags: ["Building Types"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Building type updated successfully",
          content: {
            "application/json": {
              schema: resolver(UpdateBuildingTypeResponseSchema),
            },
          },
        },
        400: {
          description: "Validation error or duplicate name",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        401: {
          description: "Unauthorized - Invalid or missing JWT token",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden - Requires admin role",
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
    validator("param", UpdateBuildingTypeParamsSchema),
    validator("json", UpdateBuildingTypeRequestSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const updates = c.req.valid("json");

      const buildingType = await BuildingType.findById(id);
      if (!buildingType) {
        return c.json(apiError("building_type_not_found", "Building type not found") satisfies ErrorResponse, 404);
      }

      if (updates.name !== undefined) buildingType.name = updates.name;
      if (updates.description !== undefined) buildingType.description = updates.description;

      try {
        await buildingType.save();
      } catch (err: unknown) {
        if (err instanceof mongo.MongoServerError && err.code === 11000) {
          return c.json(apiError("building_type_name_exists", "Building type with this name already exists") satisfies ErrorResponse, 400);
        }
        throw err;
      }

      return c.json(apiSuccess(toBuildingTypeDTO(buildingType)) satisfies UpdateBuildingTypeResponse);
    }
  )
  .delete(
    "/:id",
    requireRole("admin"),
    describeRoute({
      description: "Delete a building type (admin only)",
      tags: ["Building Types"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Building type deleted successfully",
          content: {
            "application/json": {
              schema: resolver(DeleteBuildingTypeResponseSchema),
            },
          },
        },
        400: {
          description: "Cannot delete - building type is in use",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        401: {
          description: "Unauthorized - Invalid or missing JWT token",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Forbidden - Requires admin role",
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
    validator("param", DeleteBuildingTypeParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");

      const buildingType = await BuildingType.findById(id);
      if (!buildingType) {
        return c.json(apiError("building_type_not_found", "Building type not found") satisfies ErrorResponse, 404);
      }

      // Check if any buildings use this type
      const buildingsUsingType = await Building.countDocuments({ buildingType: id });
      if (buildingsUsingType > 0) {
        return c.json(
          apiError("building_type_in_use", `Cannot delete building type: ${buildingsUsingType} building(s) are using it`) satisfies ErrorResponse,
          400
        );
      }

      await BuildingType.findByIdAndDelete(id);

      return c.json(apiSuccess({
        id,
        message: `Building type "${buildingType.name}" deleted successfully`,
      }) satisfies DeleteBuildingTypeResponse);
    }
  );

export default app;
export type AppType = typeof app;
