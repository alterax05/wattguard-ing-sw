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
  UpdateUserParamsSchema,
  UpdateUserRequestSchema,
  UpdateUserResponseSchema,
  DeleteUserParamsSchema,
  DeleteUserResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";

import type {
  DeleteUserResponse,
  ListUsersResponse,
  UpdateUserResponse,
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
              schema: resolver(UpdateUserResponseSchema),
            },
          },
        },
        400: {
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
        return c.json(apiError("cannot_update_own_account", "Cannot update your own account") satisfies ErrorResponse, 400);
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

      return c.json(apiSuccess(toUserDto(user)) satisfies UpdateUserResponse);
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
        200: {
          description: "User deleted successfully",
          content: {
            "application/json": {
              schema: resolver(DeleteUserResponseSchema),
            },
          },
        },
        400: {
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
        return c.json(apiError("cannot_delete_own_account", "Cannot delete your own account") satisfies ErrorResponse, 400);
      }

      const user = await User.findByIdAndDelete(id);
      if (!user) {
        return c.json(apiError("user_not_found", "User not found") satisfies ErrorResponse, 404);
      }

      return c.json(apiSuccess({ id }) satisfies DeleteUserResponse);
    }
  );

export default app;
export type AppType = typeof app;
