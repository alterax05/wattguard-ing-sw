/**
 * Local authentication schemas
 * 
 * Routes: /api/auth/local/setup, /api/auth/local/login, 
 *         /api/auth/local/forgot-password, /api/auth/local/reset-password,
 *         /api/auth/local/validate-reset-token
 */
import { z } from "zod";
import { EmailSchema, PasswordSchema, UserSchema, ErrorSchema, TokenQuerySchema } from "./common";

/**
 * POST /api/auth/local/setup - Setup password for invited user
 */
export const SetupRequestSchema = z.object({
  inviteToken: z.string().min(1, "Invite token is required").describe("Invitation token received via email"),
  password: PasswordSchema,
  name: z.string().min(1, "Name is required").max(100, "Name is too long").describe("User display name"),
});

export const SetupResponseSchema = z.object({
  success: z.literal(true),
  user: UserSchema.pick({ id: true, email: true, name: true, role: true }),
});

export type SetupResponse = z.infer<typeof SetupResponseSchema>;

/**
 * POST /api/auth/local/login - Login with email and password
 */
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

export const LoginResponseSchema = z.object({
  success: z.literal(true),
  user: UserSchema.pick({ id: true, email: true, name: true, role: true }),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/**
 * POST /api/auth/local/forgot-password - Request password reset
 */
export const ForgotPasswordRequestSchema = z.object({
  email: EmailSchema,
});

export const ForgotPasswordResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().describe("Success message (always returns success to prevent email enumeration)"),
});

export type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponseSchema>;

/**
 * GET /api/auth/local/validate-reset-token - Validate password reset token
 */
export const ValidateResetTokenQuerySchema = TokenQuerySchema;

export const ValidateResetTokenResponseSchema = z.object({
  valid: z.literal(true),
});

export type ValidateResetTokenResponse = z.infer<typeof ValidateResetTokenResponseSchema>;

/**
 * POST /api/auth/local/reset-password - Reset password with token
 */
export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1, "Reset token is required").describe("Password reset token"),
  password: PasswordSchema,
});

export const ResetPasswordResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().describe("Success message"),
});

export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;

// Re-export for convenience
export { ErrorSchema };
