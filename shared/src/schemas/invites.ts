import { z } from "zod";
import { EmailSchema, UserRoleSchema, IsoDateTimeSchema, PublicUserSchema, SelfLinkSchema, ObjectIdParamSchema } from "./common";

/**
 * Invite status enum
 */
export const InviteStatusSchema = z.enum(["pending", "accepted", "revoked", "expired"]);
export type InviteStatus = z.infer<typeof InviteStatusSchema>;

/**
 * Invite object schema (for responses)
 */
export const InviteSchema = z.object({
  self: SelfLinkSchema.optional(),
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
}).meta({ id: "Invite" });

export type Invite = z.infer<typeof InviteSchema>;

/**
 * POST /api/v1/invites - Created invite projection
 */
export const CreateInviteSchema = InviteSchema.pick({
  self: true,
  _id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
}).meta({ id: "CreateInvite" });

export type CreateInvite = z.infer<typeof CreateInviteSchema>;

/**
 * GET /api/v1/invites/:id - Get invite by ID params (canonical resource URI)
 */
export const GetInviteByIdParamsSchema = ObjectIdParamSchema;
export type GetInviteByIdParams = z.infer<typeof GetInviteByIdParamsSchema>;

export const GetInviteByIdResponseSchema = z.object({
  success: z.literal(true),
  data: InviteSchema,
}).meta({ id: "GetInviteByIdResponse" });
export type GetInviteByIdResponse = z.infer<typeof GetInviteByIdResponseSchema>;

/**
 * GET /api/v1/invites - List query. When `token` is present the route acts
 * as public token lookup (validation). Without `token` it lists all invites
 * (admin only).
 */
export const ListInvitesQuerySchema = z.object({
  token: z.string().min(1).optional().describe("Invitation token for public lookup"),
});

export type ListInvitesQuery = z.infer<typeof ListInvitesQuerySchema>;

/**
 * GET /api/v1/invites - List all invites response
 */
export const ListInvitesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(InviteSchema).describe("List of invites"),
}).meta({ id: "ListInvitesResponse" });

export type ListInvitesResponse = z.infer<typeof ListInvitesResponseSchema>;

/**
 * POST /api/v1/invites - Create invite request
 */
export const CreateInviteRequestSchema = z.object({
  email: EmailSchema,
  role: UserRoleSchema,
}).meta({ id: "CreateInviteRequest" });

export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;

/**
 * POST /api/v1/invites - Create invite response
 */
export const CreateInviteResponseSchema = z.object({
  success: z.literal(true),
  data: CreateInviteSchema,
}).meta({ id: "CreateInviteResponse" });

export type CreateInviteResponse = z.infer<typeof CreateInviteResponseSchema>;

/**
 * DELETE /api/v1/invites/:id - Delete / revoke invite path parameter
 */
export const DeleteInviteParamsSchema = ObjectIdParamSchema;

export type DeleteInviteParams = z.infer<typeof DeleteInviteParamsSchema>;

/**
 * Public invite lookup by token now uses GET /api/v1/invites?token=xxx.
 * The path-param form GET /api/v1/invites/:token was removed to keep one
 * canonical URI per invite (GET /api/v1/invites/:id).
 */
export const GetInviteTokenQuerySchema = z.object({
  token: z.string().min(1, "Invite token is required").describe("Invitation token"),
});

export type GetInviteTokenQuery = z.infer<typeof GetInviteTokenQuerySchema>;

/**
 * Validation response data (includes canonical id/self so the client can
 * PATCH /api/v1/invites/:id to accept)
 */
export const ValidateInviteDataSchema = z.object({
  valid: z.literal(true),
  _id: z.string().describe("Invite identifier (canonical resource id)"),
  self: SelfLinkSchema.describe("Canonical URI of the invite"),
  email: z.email().describe("Email associated with the invite"),
  role: UserRoleSchema.describe("Role assigned to the invite"),
  expiresAt: z.iso.datetime().describe("Expiration timestamp of the invite"),
}).meta({ id: "ValidateInviteData" });

export type ValidateInviteData = z.infer<typeof ValidateInviteDataSchema>;

/**
 * Validation response
 */
export const ValidateInviteResponseSchema = z.object({
  success: z.literal(true),
  data: ValidateInviteDataSchema,
}).meta({ id: "ValidateInviteResponse" });

export type ValidateInviteResponse = z.infer<typeof ValidateInviteResponseSchema>;

/**
 * PATCH /api/v1/invites/:id - Accept invite (state transition pending -> accepted).
 * Token travels in the body, never in the path. Creates the User and opens the Session.
 */
export const AcceptInviteParamsSchema = ObjectIdParamSchema;

export type AcceptInviteParams = z.infer<typeof AcceptInviteParamsSchema>;

export const AcceptInviteLocalSchema = z.object({
  token: z.string().min(1, "Invite token is required"),
  name: z.string().min(2, "Name must be at least 2 characters").max(64),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
}).meta({ id: "AcceptInviteLocal" });

export const AcceptInviteGoogleSchema = z.object({
  token: z.string().min(1, "Invite token is required"),
  idToken: z.string().min(1, "Google ID token is required"),
}).meta({ id: "AcceptInviteGoogle" });

export const AcceptInviteRequestSchema = z.union([
  AcceptInviteLocalSchema,
  AcceptInviteGoogleSchema,
]).meta({ id: "AcceptInviteRequest" });

export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequestSchema>;

export const AcceptInviteResponseSchema = z.object({
  success: z.literal(true),
  data: PublicUserSchema,
}).meta({ id: "AcceptInviteResponse" });

export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;

