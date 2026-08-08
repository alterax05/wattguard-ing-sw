/**
 * Authentication schemas for general auth routes
 * 
 * Routes: /api/auth/me, /api/auth/logout, /api/auth/admin/test-email
 */
import { z } from "zod";
import { UserSchema, SuccessSchema, ErrorSchema, EmailSchema } from "./common";

/**
 * GET /api/auth/me - Current user response
 */
export const MeResponseSchema = z.object({
  user: UserSchema,
});

export type MeResponse = z.infer<typeof MeResponseSchema>;

/**
 * POST /api/auth/logout - Logout success response
 */
export const LogoutResponseSchema = SuccessSchema;

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

/**
 * POST /api/auth/admin/test-email - Test email request
 */
export const TestEmailRequestSchema = z.object({
  to: EmailSchema.describe("Email address to send test email to"),
});

/**
 * POST /api/auth/admin/test-email - Test email success response
 */
export const TestEmailResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().describe("Success message"),
});

export type TestEmailResponse = z.infer<typeof TestEmailResponseSchema>;

// Re-export for convenience
export { ErrorSchema };
