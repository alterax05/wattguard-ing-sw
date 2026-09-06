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
  GetBuildingTypeParamsSchema,
  BuildingTypeResponseSchema,
  CreateBuildingTypeRequestSchema,
  UpdateBuildingTypeParamsSchema,
  UpdateBuildingTypeRequestSchema,
  DeleteBuildingTypeParamsSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  ListBuildingTypesResponse,
  BuildingTypeResponse,
  ErrorResponse,
} from "@wattguard/shared";

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      summary: "Elenca tipi di edificio",
      description: "Restituisce tutti i tipi di edificio ordinati per nome",
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
  .get(
    "/:id",
    describeRoute({
      summary: "Leggi tipo di edificio",
      description: "Restituisce il dettaglio di un tipo di edificio per ID",
      tags: ["Building Types"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Building type retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(BuildingTypeResponseSchema),
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
    validator("param", GetBuildingTypeParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const buildingType = await BuildingType.findById(id);
      if (!buildingType) {
        return c.json(apiError("building_type_not_found", "Building type not found") satisfies ErrorResponse, 404);
      }
      return c.json(apiSuccess(toBuildingTypeDTO(buildingType)) satisfies BuildingTypeResponse);
    }
  )
  .post(
    "/",
    requireRole("admin"),
    describeRoute({
      summary: "Crea tipo di edificio",
      description: "Crea un nuovo tipo di edificio (solo admin, nome univoco)",
      tags: ["Building Types"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        201: {
          description: "Building type created successfully",
          content: {
            "application/json": {
              schema: resolver(BuildingTypeResponseSchema),
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
        409: {
          description: "Duplicate building type name",
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

        return c.json(apiSuccess(toBuildingTypeDTO(buildingType)) satisfies BuildingTypeResponse, 201);
      } catch (err: unknown) {
        if (err instanceof mongo.MongoServerError && err.code === 11000) {
          return c.json(apiError("building_type_name_exists", "Building type with this name already exists") satisfies ErrorResponse, 409);
        }
        throw err;
      }
    }
  )
  .patch(
    "/:id",
    requireRole("admin"),
    describeRoute({
      summary: "Aggiorna tipo di edificio",
      description: "Aggiorna nome o descrizione di un tipo di edificio (solo admin)",
      tags: ["Building Types"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Building type updated successfully",
          content: {
            "application/json": {
              schema: resolver(BuildingTypeResponseSchema),
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
        409: {
          description: "Building type with this name already exists",
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
          return c.json(apiError("building_type_name_exists", "Building type with this name already exists") satisfies ErrorResponse, 409);
        }
        throw err;
      }

      return c.json(apiSuccess(toBuildingTypeDTO(buildingType)) satisfies BuildingTypeResponse);
    }
  )
  .delete(
    "/:id",
    requireRole("admin"),
    describeRoute({
      summary: "Elimina tipo di edificio",
      description: "Elimina il tipo se non è in uso da edifici (solo admin)",
      tags: ["Building Types"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        204: {
          description: "Building type deleted successfully",
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
        409: {
          description: "Cannot delete - building type is in use",
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
          apiError(
            "building_type_in_use",
            `Cannot delete building type: ${buildingsUsingType} building(s) are using it`,
            { count: buildingsUsingType }
          ) satisfies ErrorResponse,
          409
        );
      }

      await BuildingType.findByIdAndDelete(id);

      return c.body(null, 204);
    }
  );

export default app;
export type AppType = typeof app;
