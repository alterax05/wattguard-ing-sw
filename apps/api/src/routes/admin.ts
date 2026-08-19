/**
 * Admin routes
 * 
 * All routes in this file are protected by JWT authentication and admin role requirement,
 * applied globally in src/index.ts
 */
import { getRequestLocale } from "../lib/i18n";
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AuthVariables } from "../middleware/auth";
import { Invite } from "../models/Invite";
import { User } from "../models/User";
import { randomToken, hashTokenSha256 } from "../utils/crypto";
import { sendInviteEmail } from "../email/mailer";
import { inviteRateLimiter } from "../middleware/rate-limit";
import {
  ListUsersResponseSchema,
  UpdateUserParamsSchema,
  UpdateUserRequestSchema,
  UpdateUserResponseSchema,
  DeleteUserParamsSchema,
  DeleteUserResponseSchema,
  ListInvitesResponseSchema,
  CreateInviteRequestSchema,
  CreateInviteResponseSchema,
  RevokeInviteParamsSchema,
  RevokeInviteResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";

import type {
  CreateInviteResponse,
  DeleteUserResponse,
  ListInvitesResponse,
  ListUsersResponse,
  RevokeInviteResponse,
  UpdateUserResponse,
} from "@wattguard/shared";

const app = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/users",
    describeRoute({
      description: "List all registered users (admin only)",
      tags: ["Admin"],
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
        .select("-passwordHash -googleSub -__v")
        .sort({ createdAt: -1 }).lean();

      return c.json({
        users: users.map((user) => ({
          id: user._id.toString(),
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
          isDisabled: user.isDisabled,
          lastLoginAt: user.lastLoginAt?.toISOString(),
          createdAt: user.createdAt.toISOString(),
        })),
      } satisfies ListUsersResponse);
    }
  )
  .patch(
    "/users/:id",
    describeRoute({
      description: "Update a user's role or disabled status (admin only)",
      tags: ["Admin"],
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

      // Prevent admin from updating their own account (role or disabled status)
      if (payload.sub === id) {
        return c.json({ error: "Cannot update your own account", code: "cannot_update_own_account" }, 400);
      }

      const user = await User.findById(id);
      if (!user) {
        return c.json({ error: "User not found", code: "user_not_found" }, 404);
      }

      if (role !== undefined) {
        user.role = role;
      }

      if (isDisabled !== undefined) {
        user.isDisabled = isDisabled;
      }

      await user.save();

      return c.json({
        success: true as const,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
          isDisabled: user.isDisabled,
          lastLoginAt: user.lastLoginAt?.toISOString(),
          createdAt: user.createdAt.toISOString(),
        },
      } satisfies UpdateUserResponse);
    }
  )
  .delete(
    "/users/:id",
    describeRoute({
      description: "Delete a user (admin only)",
      tags: ["Admin"],
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
        return c.json({ error: "Cannot delete your own account", code: "cannot_delete_own_account" }, 400);
      }

      const user = await User.findByIdAndDelete(id);
      if (!user) {
        return c.json({ error: "User not found", code: "user_not_found" }, 404);
      }

      return c.json({ success: true as const } satisfies DeleteUserResponse);
    }
  )
  .get(
    "/invites",
    describeRoute({
      description: "List all invitation records (admin only)",
      tags: ["Admin"],
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
        .populate<{ createdBy: { email: string } }>("createdBy", "email")
        .lean();

      return c.json({
        invites: invites.map((invite) => ({
          id: invite._id.toString(),
          email: invite.email,
          role: invite.role,
          status: invite.status,
          expiresAt: invite.expiresAt.toISOString(),
          createdAt: invite.createdAt?.toISOString() ?? undefined,
          acceptedAt: invite.acceptedAt?.toISOString() ?? undefined,
          createdBy: invite.createdBy
            ? { email: invite.createdBy.email }
            : undefined,
        })),
      } satisfies ListInvitesResponse);
    }
  )
  .post(
    "/invites",
    describeRoute({
      description: "Create a new user invitation and send invitation email (admin only)",
      tags: ["Admin"],
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
        return c.json({ error: "User with this email already exists", code: "user_email_exists" }, 400);
      }

      // Check if there's already a pending invite
      const existingInvite = await Invite.findOne({
        email,
        status: "pending",
        expiresAt: { $gt: new Date() },
      });

      if (existingInvite) {
        return c.json({ error: "A pending invite already exists for this email", code: "invite_pending_exists" }, 400);
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
        // Delete the invite if email fails
        await Invite.findByIdAndDelete(invite._id);
        return c.json({ error: "Failed to send invite email. Check email configuration.", code: "invite_email_failed" }, 500);
      }

      return c.json({
        success: true as const,
        invite: {
          id: invite._id.toString(),
          email: invite.email,
          role: invite.role,
          status: invite.status,
          expiresAt: invite.expiresAt.toISOString(),
        },
      } satisfies CreateInviteResponse, 201);
    }
  )
  .post(
    "/invites/:id/revoke",
    describeRoute({
      description: "Revoke a pending invitation (admin only)",
      tags: ["Admin"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Invite revoked successfully",
          content: {
            "application/json": {
              schema: resolver(RevokeInviteResponseSchema),
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
    validator("param", RevokeInviteParamsSchema),
    async (c) => {
      const { id } = c.req.valid("param");

      const invite = await Invite.findById(id);
      if (!invite) {
        return c.json({ error: "Invite not found", code: "invite_not_found" }, 404);
      }

      if (invite.status !== "pending") {
        return c.json({ error: "Can only revoke pending invites", code: "only_pending_invites_revocable" }, 400);
      }

      invite.status = "revoked";
      await invite.save();

      return c.json({
        success: true as const,
        invite: {
          id: invite._id.toString(),
          email: invite.email,
          role: invite.role,
          status: invite.status,
          expiresAt: invite.expiresAt.toISOString(),
          createdAt: invite.createdAt?.toISOString() ?? undefined,
          acceptedAt: invite.acceptedAt?.toISOString() ?? undefined,
          createdBy: invite.createdBy?.toString() ?? undefined,
        },
      } satisfies RevokeInviteResponse);
    }
  );

export default app;
export type AppType = typeof app;
