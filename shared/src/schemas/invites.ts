import { z } from "zod";
import { EmailSchema, UserRoleSchema, IsoDateTimeSchema, PublicUserSchema } from "./common";

/**
 * Invite status enum
 */
export const InviteStatusSchema = z.enum(["pending", "accepted", "revoked", "expired"]);
export type InviteStatus = z.infer<typeof InviteStatusSchema>;

/**
 * Invite object schema (for responses)
 */
export const InviteSchema = z.object({
  _id: z.string().describe("Unique invite identifier"),
  email: z.email().describe("Email address of invitee"),
  role: UserRoleSchema,
  status: InviteStatusSchema,
  expiresAt: IsoDateTimeSchema.describe("Expiration timestamp"),
  createdAt: IsoDateTimeSchema.nullish().transform((v) => v ?? undefined).optional().describe("Creation timestamp"),
  acceptedAt: IsoDateTimeSchema.nullish().transform((v) => v ?? undefined).optional().describe("Acceptance timestamp"),
  createdBy: z.union([
    z.string(),
    z.object({ email: z.email() }),
  ]).nullish().transform((v) => v ?? undefined).optional().describe("User who created the invite"),
});

export type Invite = z.infer<typeof InviteSchema>;

/**
 * POST /api/v1/invites - Created invite projection
 */
export const CreateInviteSchema = InviteSchema.pick({
  _id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
});

export type CreateInvite = z.infer<typeof CreateInviteSchema>;

/**
 * GET /api/v1/invites - List all invites response
 */
export const ListInvitesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(InviteSchema).describe("List of invites"),
});

export type ListInvitesResponse = z.infer<typeof ListInvitesResponseSchema>;

/**
 * POST /api/v1/invites - Create invite request
 */
export const CreateInviteRequestSchema = z.object({
  email: EmailSchema,
  role: UserRoleSchema,
});

export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;

/**
 * POST /api/v1/invites - Create invite response
 */
export const CreateInviteResponseSchema = z.object({
  success: z.literal(true),
  data: CreateInviteSchema,
});

export type CreateInviteResponse = z.infer<typeof CreateInviteResponseSchema>;

/**
 * DELETE /api/v1/invites/:id - Delete / revoke invite path parameter
 */
export const DeleteInviteParamsSchema = z.object({
  id: z.string().min(1, "Invite ID is required").describe("Invite identifier"),
});

export type DeleteInviteParams = z.infer<typeof DeleteInviteParamsSchema>;
export const RevokeInviteParamsSchema = DeleteInviteParamsSchema;
export type RevokeInviteParams = DeleteInviteParams;

/**
 * DELETE /api/v1/invites/:id - Revoke invite response
 */
export const DeleteInviteResponseSchema = z.object({
  success: z.literal(true),
  data: InviteSchema,
});

export type DeleteInviteResponse = z.infer<typeof DeleteInviteResponseSchema>;
export const RevokeInviteResponseSchema = DeleteInviteResponseSchema;
export type RevokeInviteResponse = DeleteInviteResponse;

/**
 * GET /api/v1/invites/:token - Get invite details by token
 */
export const GetInviteParamsSchema = z.object({
  token: z.string().min(1, "Invite token is required").describe("Invitation token"),
});

export type GetInviteParams = z.infer<typeof GetInviteParamsSchema>;

/**
 * Validation response data
 */
export const ValidateInviteDataSchema = z.object({
  valid: z.literal(true),
  email: z.email().describe("Email associated with the invite"),
  role: UserRoleSchema.describe("Role assigned to the invite"),
  expiresAt: z.iso.datetime().describe("Expiration timestamp of the invite"),
});

export type ValidateInviteData = z.infer<typeof ValidateInviteDataSchema>;

/**
 * Validation response
 */
export const ValidateInviteResponseSchema = z.object({
  success: z.literal(true),
  data: ValidateInviteDataSchema,
});

export type ValidateInviteResponse = z.infer<typeof ValidateInviteResponseSchema>;

/**
 * POST /api/v1/invites/:token/acceptance - Accept invite request
 */
export const AcceptInviteLocalSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(64),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const AcceptInviteGoogleSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required"),
});

export const AcceptInviteRequestSchema = z.union([
  AcceptInviteLocalSchema,
  AcceptInviteGoogleSchema,
]);

export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequestSchema>;

export const AcceptInviteResponseSchema = z.object({
  success: z.literal(true),
  data: PublicUserSchema,
});

export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;

