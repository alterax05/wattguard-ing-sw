/**
 * Authentication schemas for general auth routes
 * 
 * Routes: /api/v1/auth/me, /api/v1/auth/logout, /api/v1/auth/admin/test-email
 */
import { z } from "zod";
import { UserSchema, EmailSchema } from "./common";

/**
 * GET /api/v1/auth/me - Current user response
 */
export const MeResponseSchema = z.object({
  user: UserSchema,
});

export type MeResponse = z.infer<typeof MeResponseSchema>;

/**
 * POST /api/v1/auth/logout - Logout success response
 */
export const LogoutResponseSchema = z.object({
  success: z.literal(true),
});

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

/**
 * POST /api/v1/auth/admin/test-email - Test email request
 */
export const TestEmailRequestSchema = z.object({
  to: EmailSchema.describe("Email address to send test email to"),
});

export type TestEmailRequest = z.infer<typeof TestEmailRequestSchema>;

/**
 * POST /api/v1/auth/admin/test-email - Test email success response
 */
export const TestEmailResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().describe("Success message"),
});

export type TestEmailResponse = z.infer<typeof TestEmailResponseSchema>;
