/**
 * Admin routes
 * 
 * All routes in this file are protected by JWT authentication and admin role requirement,
 * applied globally in src/index.ts
 */
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AuthVariables } from "../middleware/auth";
import { Invite } from "../models/Invite";
import { User } from "../models/User";
import { randomToken, hashTokenSha256 } from "../utils/crypto";
import { sendInviteEmail } from "../email/mailer";
import { inviteRateLimiter } from "../middleware/rate-limit";
import {
  ListInvitesResponseSchema,
  CreateInviteRequestSchema,
  CreateInviteResponseSchema,
  RevokeInviteParamsSchema,
  RevokeInviteResponseSchema,
  ErrorSchema,
} from "../schemas/admin";

/**
 * GET /api/admin/invites - List all invites
 * POST /api/admin/invites - Create a new invite
 * POST /api/admin/invites/:id/revoke - Revoke an invite
 * 
 * Note: JWT authentication and admin role middleware are applied globally in index.ts
 */
const app = new Hono<{ Variables: AuthVariables }>()
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
        .populate("createdBy", "email")
        .limit(100);

      return c.json({ invites });
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
        return c.json({ error: "User with this email already exists" }, 400);
      }

      // Check if there's already a pending invite
      const existingInvite = await Invite.findOne({
        email,
        status: "pending",
        expiresAt: { $gt: new Date() },
      });

      if (existingInvite) {
        return c.json({ error: "A pending invite already exists for this email" }, 400);
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
        await sendInviteEmail(email, token, role);
      } catch (err) {
        console.error("Failed to send invite email:", err);
        // Delete the invite if email fails
        await Invite.findByIdAndDelete(invite._id);
        return c.json({ error: "Failed to send invite email. Check SMTP configuration." }, 500);
      }

      return c.json({
        success: true,
        invite: {
          id: invite._id.toString(),
          email: invite.email,
          role: invite.role,
          status: invite.status,
          expiresAt: invite.expiresAt.toISOString(),
        },
      }, 201);
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
        return c.json({ error: "Invite not found" }, 404);
      }

      if (invite.status !== "pending") {
        return c.json({ error: "Can only revoke pending invites" }, 400);
      }

      invite.status = "revoked";
      await invite.save();

      return c.json({ success: true, invite });
    }
  );

export default app;
export type AppType = typeof app;
