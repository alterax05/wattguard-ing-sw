/**
 * Invite routes (public)
 */
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Invite } from "../models/Invite";
import { hashTokenSha256 } from "../utils/crypto";
import {
  GetInviteParamsSchema,
  ValidateInviteQuerySchema,
  ValidateInviteResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type { ValidateInviteResponse } from "@wattguard/shared";
import type { Context } from "hono";

async function handleValidateInvite(token: string, c: Context) {
  const tokenHash = hashTokenSha256(token);
  const invite = await Invite.findOne({ tokenHash });

  if (!invite) {
    return c.json({ error: "Invalid invite token", code: "invite_invalid_token" }, 404);
  }

  if (invite.status !== "pending") {
    return c.json(
      { error: `Invite is ${invite.status}`, code: "invite_invalid_status" },
      400
    );
  }

  if (invite.expiresAt < new Date()) {
    return c.json({ error: "Invite has expired", code: "invite_expired" }, 400);
  }

  return c.json({
    valid: true,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
  } satisfies ValidateInviteResponse);
}

/**
 * Public: Validate an invite token
 * GET /api/v1/invites/:token
 * GET /api/v1/invites/validate?token=...
 */
const app = new Hono()
  .get(
    "/validate",
    describeRoute({
      description: "Validate an invitation token and retrieve invite details",
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
    validator("query", ValidateInviteQuerySchema),
    async (c) => {
      const { token } = c.req.valid("query");
      return handleValidateInvite(token, c);
    }
  )
  .get(
    "/:token",
    describeRoute({
      description: "Get invitation details by token",
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
      return handleValidateInvite(token, c);
    }
  );



export default app;
export type AppType = typeof app;
