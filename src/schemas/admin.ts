/**
 * Admin route schemas
 * 
 * Routes: /api/admin/invites (GET, POST), /api/admin/invites/:id/revoke (POST)
 */
import { z } from "zod";
import { EmailSchema, UserRoleSchema, SuccessSchema, ErrorSchema } from "./common";

/**
 * Invite status enum
 */
export const InviteStatusSchema = z.enum(["pending", "accepted", "revoked", "expired"]);

/**
 * Invite object schema (for responses)
 */
export const InviteSchema = z.object({
  id: z.string().describe("Unique invite identifier"),
  email: z.email().describe("Email address of invitee"),
  role: UserRoleSchema,
  status: InviteStatusSchema,
  expiresAt: z.iso.datetime().describe("Expiration timestamp"),
  createdAt: z.iso.datetime().optional().describe("Creation timestamp"),
  acceptedAt: z.iso.datetime().optional().describe("Acceptance timestamp"),
  createdBy: z.union([
    z.string(),
    z.object({ email: z.email() }),
  ]).optional().describe("User who created the invite"),
});

/**
 * GET /api/admin/invites - List all invites response
 */
export const ListInvitesResponseSchema = z.object({
  invites: z.array(InviteSchema).describe("List of invites"),
});

/**
 * POST /api/admin/invites - Create invite request
 */
export const CreateInviteRequestSchema = z.object({
  email: EmailSchema,
  role: UserRoleSchema,
});

/**
 * POST /api/admin/invites - Create invite response
 */
export const CreateInviteResponseSchema = z.object({
  success: z.literal(true),
  invite: InviteSchema.pick({
    id: true,
    email: true,
    role: true,
    status: true,
    expiresAt: true,
  }),
});

/**
 * POST /api/admin/invites/:id/revoke - Revoke invite path parameter
 */
export const RevokeInviteParamsSchema = z.object({
  id: z.string().min(1, "Invite ID is required").describe("Invite identifier"),
});

/**
 * POST /api/admin/invites/:id/revoke - Revoke invite response
 */
export const RevokeInviteResponseSchema = z.object({
  success: z.literal(true),
  invite: InviteSchema,
});

// Re-export for convenience
export { ErrorSchema };
