/**
 * Admin route schemas
 * 
 * Routes: /api/v1/admin/users (GET, PATCH), /api/v1/admin/invites (GET, POST), /api/v1/admin/invites/:id/revoke (POST)
 */
import { z } from "zod";
import { EmailSchema, UserRoleSchema, UserSchema } from "./common";

/**
 * Invite status enum
 */
export const InviteStatusSchema = z.enum(["pending", "accepted", "revoked", "expired"]);
export type InviteStatus = z.infer<typeof InviteStatusSchema>;

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

export type Invite = z.infer<typeof InviteSchema>;

/**
 * GET /api/v1/admin/invites - List all invites response
 */
export const ListInvitesResponseSchema = z.object({
  invites: z.array(InviteSchema).describe("List of invites"),
});

export type ListInvitesResponse = z.infer<typeof ListInvitesResponseSchema>;

/**
 * POST /api/v1/admin/invites - Create invite request
 */
export const CreateInviteRequestSchema = z.object({
  email: EmailSchema,
  role: UserRoleSchema,
});

export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;

/**
 * POST /api/v1/admin/invites - Create invite response
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

export type CreateInviteResponse = z.infer<typeof CreateInviteResponseSchema>;

/**
 * POST /api/v1/admin/invites/:id/revoke - Revoke invite path parameter
 */
export const RevokeInviteParamsSchema = z.object({
  id: z.string().min(1, "Invite ID is required").describe("Invite identifier"),
});

/**
 * POST /api/v1/admin/invites/:id/revoke - Revoke invite response
 */
export const RevokeInviteResponseSchema = z.object({
  success: z.literal(true),
  invite: InviteSchema,
});

export type RevokeInviteResponse = z.infer<typeof RevokeInviteResponseSchema>;

/**
 * GET /api/v1/admin/users - List all users response
 */
export const ListUsersResponseSchema = z.object({
  users: z.array(UserSchema).describe("List of users"),
});

export type ListUsersResponse = z.infer<typeof ListUsersResponseSchema>;

/**
 * PATCH /api/v1/admin/users/:id - Update user path parameter
 */
export const UpdateUserParamsSchema = z.object({
  id: z.string().min(1, "User ID is required").describe("User identifier"),
});

/**
 * PATCH /api/v1/admin/users/:id - Update user request body (partial update)
 */
export const UpdateUserRequestSchema = UserSchema.pick({ role: true, isDisabled: true })
  .partial()
  .refine((data) => data.role !== undefined || data.isDisabled !== undefined, {
    message: "At least one field (role or isDisabled) must be provided",
  });

export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

/**
 * PATCH /api/v1/admin/users/:id - Update user response
 */
export const UpdateUserResponseSchema = z.object({
  success: z.literal(true),
  user: UserSchema,
});

export type UpdateUserResponse = z.infer<typeof UpdateUserResponseSchema>;

/**
 * DELETE /api/v1/admin/users/:id - Delete user path parameter
 */
export const DeleteUserParamsSchema = z.object({
  id: z.string().min(1, "User ID is required").describe("User identifier"),
});

/**
 * DELETE /api/v1/admin/users/:id - Delete user response
 */
export const DeleteUserResponseSchema = z.object({
  success: z.literal(true),
});

export type DeleteUserResponse = z.infer<typeof DeleteUserResponseSchema>;
