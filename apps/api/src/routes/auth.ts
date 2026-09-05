import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AuthVariables } from "../middleware/auth";
import {
  MeResponseSchema,
  LogoutResponseSchema,
  UpdateLanguageRequestSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  LogoutResponse,
  MeResponse,
} from "@wattguard/shared";
import { apiSuccess } from "../lib/api-response";
import { toUserDto } from "../lib/users";

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/me",
    describeRoute({
      description: "Get current authenticated user information",
      tags: ["Authentication"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Current user information",
          content: {
            "application/json": {
              schema: resolver(MeResponseSchema),
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
      },
    }),
    (c) => {
      const userDoc = c.get("userDoc");
      return c.json(apiSuccess(toUserDto(userDoc)) satisfies MeResponse);
    }
  )
  .patch(
    "/me/language",
    describeRoute({
      description: "Update the current user's preferred language (used for alert emails)",
      tags: ["Authentication"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Updated current user information",
          content: {
            "application/json": {
              schema: resolver(MeResponseSchema),
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
      },
    }),
    validator("json", UpdateLanguageRequestSchema),
    async (c) => {
      const { language } = c.req.valid("json");
      const userDoc = c.get("userDoc");

      userDoc.language = language;
      await userDoc.save();

      return c.json(apiSuccess(toUserDto(userDoc)) satisfies MeResponse);
    }
  )
  .delete(
    "/session",
    describeRoute({
      description: "Destroy current user session (logout)",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Session destroyed successfully",
          content: {
            "application/json": {
              schema: resolver(LogoutResponseSchema),
            },
          },
        },
      },
    }),
    (c) => {
      setCookie(c, "access_token", "", {
        maxAge: 0,
        path: "/",
      });

      return c.json(apiSuccess({ message: "Session destroyed successfully" }) satisfies LogoutResponse);
    }
  )
  .post(
    "/logout",

    describeRoute({
      description: "Logout current user by clearing authentication cookie",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Logout successful",
          content: {
            "application/json": {
              schema: resolver(LogoutResponseSchema),
            },
          },
        },
      },
    }),
    (c) => {
      setCookie(c, "access_token", "", {
        maxAge: 0,
        path: "/",
      });

      return c.json(apiSuccess({ message: "Logout successful" }) satisfies LogoutResponse);
    }
  );

export default app;
export type AppType = typeof app;
