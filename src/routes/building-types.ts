/**
 * Building Types routes
 * 
 * All routes in this file require JWT authentication and admin/operator role,
 * applied globally in src/index.ts
 * 
 * Admin only: POST, PATCH, DELETE (managing building types)
 * Admin + Operator: GET (viewing building types)
 */
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AuthVariables } from "../middleware/auth";
import { BuildingType } from "../models/BuildingType";
import { Building } from "../models/Building";
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
} from "../schemas/building-types";
import type {
  CreateBuildingTypeResponse,
  DeleteBuildingTypeResponse,
  ListBuildingTypesResponse,
  UpdateBuildingTypeResponse,
} from "../schemas/building-types";

const app = new Hono<{ Variables: AuthVariables }>()
  /**
   * GET /api/building-types - List all building types
   * Auth: admin + operator
   */
  .get(
    "/",
    describeRoute({
      description: "List all building types (admin and operator)",
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

      return c.json({
        buildingTypes: buildingTypes.map((bt) => ({
          id: bt._id.toString(),
          name: bt.name,
          description: bt.description ?? undefined,
          createdAt: bt.createdAt.toISOString(),
          updatedAt: bt.updatedAt.toISOString(),
        })),
      } satisfies ListBuildingTypesResponse);
    }
  )

  /**
   * POST /api/building-types - Create a new building type
   * Auth: admin only
   */
  .post(
    "/",
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
      const payload = c.get("jwtPayload");
      const { name, description } = c.req.valid("json");

      // Check if admin (this route should only be accessible to admins)
      if (payload.role !== "admin") {
        return c.json({ error: "Only admins can create building types" }, 403);
      }

      // Check for duplicate name
      const existing = await BuildingType.findOne({ name });
      if (existing) {
        return c.json({ error: "Building type with this name already exists" }, 400);
      }

      // Create building type
      const buildingType = await BuildingType.create({
        name,
        description,
      });

      return c.json(
        {
          success: true,
          buildingType: {
            id: buildingType._id.toString(),
            name: buildingType.name,
            description: buildingType.description ?? undefined,
            createdAt: buildingType.createdAt.toISOString(),
            updatedAt: buildingType.updatedAt.toISOString(),
          },
        } satisfies CreateBuildingTypeResponse,
        201
      );
    }
  )

  /**
   * PATCH /api/building-types/:id - Update a building type
   * Auth: admin only
   */
  .patch(
    "/:id",
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
      const payload = c.get("jwtPayload");
      const { id } = c.req.valid("param");
      const updates = c.req.valid("json");

      // Check if admin
      if (payload.role !== "admin") {
        return c.json({ error: "Only admins can update building types" }, 403);
      }

      // Find building type
      const buildingType = await BuildingType.findById(id);
      if (!buildingType) {
        return c.json({ error: "Building type not found" }, 404);
      }

      // Check for duplicate name if name is being updated
      if (updates.name && updates.name !== buildingType.name) {
        const existing = await BuildingType.findOne({ name: updates.name });
        if (existing) {
          return c.json({ error: "Building type with this name already exists" }, 400);
        }
      }

      // Update fields
      if (updates.name !== undefined) buildingType.name = updates.name;
      if (updates.description !== undefined) buildingType.description = updates.description;

      await buildingType.save();

      return c.json({
        success: true,
        buildingType: {
          id: buildingType._id.toString(),
          name: buildingType.name,
          description: buildingType.description ?? undefined,
          createdAt: buildingType.createdAt.toISOString(),
          updatedAt: buildingType.updatedAt.toISOString(),
        },
      } satisfies UpdateBuildingTypeResponse);
    }
  )

  /**
   * DELETE /api/building-types/:id - Delete a building type
   * Auth: admin only
   */
  .delete(
    "/:id",
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
      const payload = c.get("jwtPayload");
      const { id } = c.req.valid("param");

      // Check if admin
      if (payload.role !== "admin") {
        return c.json({ error: "Only admins can delete building types" }, 403);
      }

      // Find building type
      const buildingType = await BuildingType.findById(id);
      if (!buildingType) {
        return c.json({ error: "Building type not found" }, 404);
      }

      // Check if any buildings use this type
      const buildingsUsingType = await Building.countDocuments({ buildingType: id });
      if (buildingsUsingType > 0) {
        return c.json(
          {
            error: `Cannot delete building type: ${buildingsUsingType} building(s) are using it`,
          },
          400
        );
      }

      // Delete building type
      await BuildingType.findByIdAndDelete(id);

      return c.json({
        success: true,
        message: `Building type "${buildingType.name}" deleted successfully`,
      } satisfies DeleteBuildingTypeResponse);
    }
  );

export default app;
export type AppType = typeof app;
