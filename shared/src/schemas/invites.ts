/**
 * Invite validation schemas
 * 
 * Routes: /api/invites/validate
 */
import { z } from "zod";
import { UserRoleSchema, TokenQuerySchema, ErrorSchema } from "./common";

/**
 * GET /api/invites/validate - Validate invite token (query parameter)
 */
export const ValidateInviteQuerySchema = TokenQuerySchema;

/**
 * GET /api/invites/validate - Success response
 */
export const ValidateInviteResponseSchema = z.object({
  valid: z.literal(true),
  email: z.email().describe("Email associated with the invite"),
  role: UserRoleSchema.describe("Role assigned to the invite"),
  expiresAt: z.iso.datetime().describe("Expiration timestamp of the invite"),
});

export type ValidateInviteResponse = z.infer<typeof ValidateInviteResponseSchema>;

// Re-export for convenience
export { ErrorSchema };
