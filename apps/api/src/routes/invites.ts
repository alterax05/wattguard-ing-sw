import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Invite } from "../models/Invite";
import { User } from "../models/User";
import { randomToken, hashTokenSha256 } from "../utils/crypto";
import { sendInviteEmail } from "../email/mailer";
import { getRequestLocale } from "../lib/i18n";
import { validateInviteToken, toInviteDto, toCreateInviteDto } from "../lib/invites";
import { inviteRateLimiter } from "../middleware/rate-limit";
import { jwt } from "hono/jwt";
import { JWT_SECRET } from "../config/variables";
import { loadUserDoc, requireRole, type AuthVariables } from "../middleware/auth";
import { apiError, apiSuccess } from "../lib/api-response";
import {
  GetInviteParamsSchema,
  ValidateInviteResponseSchema,
  ListInvitesResponseSchema,
  CreateInviteRequestSchema,
  CreateInviteResponseSchema,
  DeleteInviteParamsSchema,
  DeleteInviteResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  ListInvitesResponse,
  CreateInviteResponse,
  DeleteInviteResponse,
  ValidateInviteResponse,
  ErrorResponse,
} from "@wattguard/shared";

const requireAdmin = [
  jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
  loadUserDoc(),
  requireRole("admin"),
] as const;

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    ...requireAdmin,
    describeRoute({
      description: "List all invitation records (admin only)",
      tags: ["Invites"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "List of invites retrieved successfully",
          content: {
            "application/json": {
              schema: resolver(ListInvitesResponseSchema),
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
      const invites = await Invite.find()
        .sort({ createdAt: -1 })
        .populate("createdBy", "email");

      return c.json(apiSuccess(invites.map(toInviteDto)) satisfies ListInvitesResponse);
    }
  )
  .post(
    "/",
    ...requireAdmin,
    describeRoute({
      description: "Create a new user invitation and send invitation email (admin only)",
      tags: ["Invites"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        201: {
          description: "Invite created and email sent successfully",
          content: {
            "application/json": {
              schema: resolver(CreateInviteResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid request - validation error or duplicate user/invite",
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
        500: {
          description: "Failed to send invitation email",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    inviteRateLimiter,
    validator("json", CreateInviteRequestSchema),
    async (c) => {
      const payload = c.get("jwtPayload");
      const { email, role } = c.req.valid("json");

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return c.json(apiError("user_email_exists", "User with this email already exists") satisfies ErrorResponse, 400);
      }

      // Check if there's already a pending invite
      const existingInvite = await Invite.findOne({
        email,
        status: "pending",
        expiresAt: { $gt: new Date() },
      });

      if (existingInvite) {
        return c.json(apiError("invite_pending_exists", "A pending invite already exists for this email") satisfies ErrorResponse, 400);
      }

      // Generate token
      const token = randomToken(32);
      const tokenHash = hashTokenSha256(token);

      // Create invite (using sub claim which contains the user ID)
      const invite = await Invite.create({
        email,
        role,
        tokenHash,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        createdBy: payload.sub,
      });

      // Send email
      try {
        await sendInviteEmail(email, token, role, getRequestLocale(c));
      } catch (err) {
        console.error("Failed to send invite email:", err);
        await Invite.findByIdAndDelete(invite._id);
        return c.json(apiError("invite_email_failed", "Failed to send invite email. Check email configuration.") satisfies ErrorResponse, 500);
      }

      c.header("Location", `${c.req.path}/${invite._id.toString()}`);

      return c.json(apiSuccess(toCreateInviteDto(invite)) satisfies CreateInviteResponse, 201);
    }
  )
  .delete(
    "/:id",
    ...requireAdmin,
    describeRoute({
      description: "Revoke/delete a pending invitation (admin only)",
      tags: ["Invites"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Invite revoked successfully",
          content: {
            "application/json": {
              schema: resolver(DeleteInviteResponseSchema),
            },
          },
        },
        400: {
          description: "Invite cannot be revoked (not pending)",
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
          description: "Invite not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("param", DeleteInviteParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");

      const invite = await Invite.findById(id);
      if (!invite) {
        return c.json(apiError("invite_not_found", "Invite not found") satisfies ErrorResponse, 404);
      }

      if (invite.status !== "pending") {
        return c.json(apiError("only_pending_invites_revocable", "Can only revoke pending invites") satisfies ErrorResponse, 400);
      }

      invite.status = "revoked";
      await invite.save();

      return c.json(apiSuccess(toInviteDto(invite)) satisfies DeleteInviteResponse);
    }
  )
  .get(
    "/:token",
    describeRoute({
      description: "Get invitation details by token (public)",
      tags: ["Invites"],
      responses: {
        200: {
          description: "Invite is valid and can be used",
          content: {
            "application/json": {
              schema: resolver(ValidateInviteResponseSchema),
            },
          },
        },
        400: {
          description: "Invite is expired or already used",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        404: {
          description: "Invite token not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("param", GetInviteParamsSchema),
    async (c) => {
      const { token } = c.req.valid("param");
      const result = await validateInviteToken(token);
      if (!result.ok) {
        return c.json(apiError(result.code, result.error) satisfies ErrorResponse, result.status);
      }
      return c.json(apiSuccess(result.data) satisfies ValidateInviteResponse);
    }
  );

export default app;
export type AppType = typeof app;
