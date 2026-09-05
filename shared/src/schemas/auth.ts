/**
 * Authentication schemas for general auth routes
 * 
 * Routes: /api/v1/auth/me, /api/v1/auth/logout, /api/v1/auth/admin/test-email
 */
import { z } from "zod";
import { UserSchema } from "./common";

/**
 * GET /api/v1/auth/me - Current user response
 */
export const MeResponseSchema = z.object({
  success: z.literal(true),
  data: UserSchema,
});

export type MeResponse = z.infer<typeof MeResponseSchema>;

/**
 * POST /api/v1/auth/logout - Logout success response
 */
export const LogoutResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string().optional().describe("Success message"),
  }),
});

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

/**
 * POST /api/v1/auth/admin/test-email - Test email success response
 */
export const TestEmailResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string().describe("Success message"),
  }),
});

export type TestEmailResponse = z.infer<typeof TestEmailResponseSchema>;
