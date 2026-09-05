import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { describeRoute, resolver, validator } from "hono-openapi";
import { OAuth2Client } from "google-auth-library";
import { Invite } from "../models/Invite";
import { User } from "../models/User";
import { randomToken, hashTokenSha256 } from "../utils/crypto";
import { signAccessToken } from "../auth/jwt";
import { toPublicUserDto } from "../lib/users";
import { sendInviteEmail } from "../email/mailer";
import { getRequestLocale } from "../lib/i18n";
import { validateInviteToken, toInviteDto, toCreateInviteDto } from "../lib/invites";
import { inviteRateLimiter } from "../middleware/rate-limit";
import { jwt } from "hono/jwt";
import { GOOGLE_CLIENT_ID, IS_PRODUCTION, JWT_SECRET } from "../config/variables";
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
  AcceptInviteRequestSchema,
  AcceptInviteResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  ListInvitesResponse,
  CreateInviteResponse,
  DeleteInviteResponse,
  ValidateInviteResponse,
  AcceptInviteResponse,
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
  )
  .post(
    "/:token/acceptance",
    describeRoute({
      description: "Accept an invitation and activate user account (local password or Google SSO)",
      tags: ["Invites"],
      responses: {
        200: {
          description: "Invitation accepted successfully, user created and session established",
          content: {
            "application/json": {
              schema: resolver(AcceptInviteResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid or expired invite, or user already exists, or email mismatch",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        401: {
          description: "Invalid Google ID token",
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
        409: {
          description: "Google account already linked to another user",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        503: {
          description: "Google OAuth not configured",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("param", GetInviteParamsSchema),
    validator("json", AcceptInviteRequestSchema),
    async (c) => {
      const { token } = c.req.valid("param");
      const input = c.req.valid("json");

      const tokenHash = hashTokenSha256(token);
      const invite = await Invite.findOne({ tokenHash });

      if (!invite) {
        return c.json(
          apiError("invite_not_found", "Invite not found") satisfies ErrorResponse,
          404,
        );
      }

      if (invite.status !== "pending") {
        return c.json(
          apiError("invite_invalid_or_used", "Invite is no longer pending") satisfies ErrorResponse,
          400,
        );
      }

      if (invite.expiresAt < new Date()) {
        invite.status = "expired";
        await invite.save();
        return c.json(
          apiError("invite_expired", "Invite has expired") satisfies ErrorResponse,
          400,
        );
      }

      const existingUser = await User.findOne({ email: invite.email });

      let user;

      if ("idToken" in input) {
        if (!GOOGLE_CLIENT_ID) {
          return c.json(
            apiError("oauth_not_configured", "Google sign-in is not configured") satisfies ErrorResponse,
            503,
          );
        }

        const client = new OAuth2Client(GOOGLE_CLIENT_ID);
        let payload;
        try {
          const ticket = await client.verifyIdToken({
            idToken: input.idToken,
            audience: GOOGLE_CLIENT_ID,
          });
          payload = ticket.getPayload();
        } catch (err) {
          console.error("Google token verification failed:", err);
          return c.json(
            apiError("oauth_invalid_token", "Invalid or expired Google token") satisfies ErrorResponse,
            401,
          );
        }

        if (!payload || !payload.email || !payload.sub) {
          return c.json(
            apiError("oauth_invalid_token", "Invalid Google token payload") satisfies ErrorResponse,
            401,
          );
        }

        if (payload.email_verified === false) {
          return c.json(
            apiError("oauth_email_not_verified", "Google email is not verified") satisfies ErrorResponse,
            400,
          );
        }

        if (payload.email.toLowerCase().trim() !== invite.email.toLowerCase().trim()) {
          return c.json(
            apiError("oauth_email_mismatch", "Google email does not match the invitation email") satisfies ErrorResponse,
            400,
          );
        }

        if (existingUser) {
          if (existingUser.googleSub && existingUser.googleSub !== payload.sub) {
            return c.json(
              apiError("oauth_account_mismatch", "This Google account is linked to a different user") satisfies ErrorResponse,
              409,
            );
          }
          if (!existingUser.googleSub) {
            existingUser.googleSub = payload.sub;
            if (!existingUser.name && payload.name) {
              existingUser.name = payload.name;
            }
            await existingUser.save();
          }
          user = existingUser;
        } else {
          user = await User.create({
            email: invite.email,
            name: payload.name || undefined,
            role: invite.role,
            isDisabled: false,
            googleSub: payload.sub,
          });
        }
      } else {
        if (existingUser) {
          return c.json(
            apiError("user_email_exists", "User already exists") satisfies ErrorResponse,
            400,
          );
        }

        const passwordHash = await Bun.password.hash(input.password, {
          algorithm: "bcrypt",
          cost: 10,
        });

        user = await User.create({
          email: invite.email,
          name: input.name,
          role: invite.role,
          isDisabled: false,
          passwordHash,
          passwordUpdatedAt: new Date(),
        });
      }

      invite.status = "accepted";
      invite.acceptedAt = new Date();
      await invite.save();

      user.lastLoginAt = new Date();
      await user.save();

      const jwtToken = await signAccessToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      setCookie(c, "access_token", jwtToken, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });

      return c.json(apiSuccess(toPublicUserDto(user)) satisfies AcceptInviteResponse);
    },
  );

export default app;
export type AppType = typeof app;
