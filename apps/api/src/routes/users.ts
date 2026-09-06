/**
 * User routes
 * 
 * All routes in this file are protected by JWT authentication and admin role requirement.
 */
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AuthVariables } from "../middleware/auth";
import { User } from "../models/User";
import { toUserDto } from "../lib/users";
import { apiError, apiSuccess } from "../lib/api-response";
import {
  ListUsersResponseSchema,
  GetUserParamsSchema,
  UserResponseSchema,
  UpdateUserParamsSchema,
  UpdateUserRequestSchema,
  DeleteUserParamsSchema,
  ErrorSchema,
} from "@wattguard/shared";

import type {
  ListUsersResponse,
  UserResponse,
  ErrorResponse,
} from "@wattguard/shared";

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    describeRoute({
      summary: "Elenca utenti",
      description: "Restituisce tutti gli utenti registrati (solo admin)",
      tags: ["Users"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "List of users retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(ListUsersResponseSchema),
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
    async (c) => {
      const users = await User.find()
        .sort({ createdAt: -1 });

      return c.json(apiSuccess(users.map(toUserDto)) satisfies ListUsersResponse);
    }
  )
  .get(
    "/:id",
    describeRoute({
      summary: "Leggi utente",
      description: "Restituisce i dati di un singolo utente per ID (solo admin)",
      tags: ["Users"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "User details retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(UserResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid user ID parameter",
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
          description: "User not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("param", GetUserParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const user = await User.findById(id);
      if (!user) {
        return c.json(apiError("user_not_found", "User not found") satisfies ErrorResponse, 404);
      }
      return c.json(apiSuccess(toUserDto(user)) satisfies UserResponse);
    }
  )
  .patch(
    "/:id",
    describeRoute({
      summary: "Aggiorna utente",
      description: "Aggiorna ruolo o disabilitazione di un utente (solo admin, non sé stesso)",
      tags: ["Users"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "User updated successfully",
          content: {
            "application/json": {
              schema: resolver(UserResponseSchema),
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
          description: "Cannot update your own account or empty update body",
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
          description: "User not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("param", UpdateUserParamsSchema),
    validator("json", UpdateUserRequestSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const { role, isDisabled } = c.req.valid("json");
      const payload = c.get("jwtPayload");

      // Prevent admin from modifying their own role or disabling themselves
      if (payload.sub === id) {
        return c.json(apiError("cannot_update_own_account", "Cannot update your own account") satisfies ErrorResponse, 422);
      }

      const user = await User.findById(id);
      if (!user) {
        return c.json(apiError("user_not_found", "User not found") satisfies ErrorResponse, 404);
      }

      if (role !== undefined) {
        user.role = role;
      }

      if (isDisabled !== undefined) {
        user.isDisabled = isDisabled;
      }

      await user.save();

      return c.json(apiSuccess(toUserDto(user)) satisfies UserResponse);
    }
  )
  .delete(
    "/:id",
    describeRoute({
      summary: "Elimina utente",
      description: "Elimina un utente (solo admin, non sé stesso)",
      tags: ["Users"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        204: {
          description: "User deleted successfully",
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
          description: "Cannot delete your own account",
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
          description: "User not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("param", DeleteUserParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const payload = c.get("jwtPayload");

      // Prevent admin from deleting themselves
      if (payload.sub === id) {
        return c.json(apiError("cannot_delete_own_account", "Cannot delete your own account") satisfies ErrorResponse, 422);
      }

      const user = await User.findByIdAndDelete(id);
      if (!user) {
        return c.json(apiError("user_not_found", "User not found") satisfies ErrorResponse, 404);
      }

      return c.body(null, 204);
    }
  );

export default app;
export type AppType = typeof app;
