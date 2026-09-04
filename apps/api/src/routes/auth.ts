/**
 * General auth routes (me, logout, admin test email)
 * 
 * Protected routes (/me, /admin/*) have JWT authentication applied globally in src/index.ts
 */
import { getRequestLocale } from "../lib/i18n";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AuthVariables } from "../middleware/auth";
import { sendTestEmail } from "../email/mailer";
import {
  MeResponseSchema,
  LogoutResponseSchema,
  TestEmailRequestSchema,
  TestEmailResponseSchema,
  UpdateLanguageRequestSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  LogoutResponse,
  MeResponse,
  TestEmailResponse,
} from "@wattguard/shared";
import { User } from "../models/User";

/**
 * GET /api/auth/me - Get current user (protected, middleware applied globally)
 * POST /api/auth/logout - Logout (public)
 * POST /api/auth/admin/test-email - Admin: Test email configuration (protected, admin role required)
 */
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
      const payload = c.get("jwtPayload");
      const userDoc = c.get("userDoc");

      return c.json({
        user: {
          id: userDoc._id?.toString() ?? undefined,
          email: payload.email,
          name: userDoc.name ?? undefined,
          role: payload.role,
          isDisabled: userDoc.isDisabled ?? false,
          language: userDoc.language ?? undefined,
          lastLoginAt: userDoc.lastLoginAt?.toISOString() ?? undefined,
        },
      } satisfies MeResponse);
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

      await User.findByIdAndUpdate(userDoc._id, { $set: { language } });

      return c.json({
        user: {
          id: userDoc._id?.toString() ?? undefined,
          email: c.get("jwtPayload").email,
          name: userDoc.name ?? undefined,
          role: userDoc.role,
          isDisabled: userDoc.isDisabled ?? false,
          language,
          lastLoginAt: userDoc.lastLoginAt?.toISOString() ?? undefined,
        },
      } satisfies MeResponse);
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

      return c.json({ success: true } satisfies LogoutResponse);
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

      return c.json({ success: true } satisfies LogoutResponse);
    }
  )
  .post(
    "/admin/test-email",
    describeRoute({
      description: "Send test email to verify email configuration (admin only)",
      tags: ["Authentication"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Test email sent successfully",
          content: {
            "application/json": {
              schema: resolver(TestEmailResponseSchema),
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
        500: {
          description: "Failed to send test email",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("json", TestEmailRequestSchema),
    async (c) => {
      try {
        const { to } = c.req.valid("json");

        await sendTestEmail(to, getRequestLocale(c));

        return c.json({ success: true, message: "Test email sent" } satisfies TestEmailResponse);
      } catch (err) {
        console.error("Test email failed:", err);
        return c.json({ error: "Failed to send test email. Check email configuration.", code: "test_email_failed" }, 500);
      }
    }
  );

export default app;
export type AppType = typeof app;
