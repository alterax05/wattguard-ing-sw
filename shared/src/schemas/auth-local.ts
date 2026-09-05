/**
 * Local authentication schemas
 * 
 * Routes: /api/v1/auth/local/setup, /api/v1/auth/local/login, 
 *         /api/v1/auth/local/forgot-password, /api/v1/auth/local/reset-password,
 *         /api/v1/auth/local/validate-reset-token
 */
import { z } from "zod";
import { EmailSchema, PasswordSchema, PublicUserSchema, TokenQuerySchema } from "./common";

/**
 * POST /api/v1/auth/local/setup - Setup password for invited user
 */
export const SetupRequestSchema = z.object({
  inviteToken: z.string().min(1, "Invite token is required").describe("Invitation token received via email"),
  password: PasswordSchema,
  name: z.string().min(1, "Name is required").max(100, "Name is too long").describe("User display name"),
});

export type SetupRequest = z.infer<typeof SetupRequestSchema>;

export const SetupResponseSchema = z.object({
  success: z.literal(true),
  data: PublicUserSchema,
});

export type SetupResponse = z.infer<typeof SetupResponseSchema>;

/**
 * POST /api/v1/auth/local/login - Login with email and password
 */
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  success: z.literal(true),
  data: PublicUserSchema,
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/**
 * POST /api/v1/auth/local/forgot-password - Request password reset
 */
export const ForgotPasswordRequestSchema = z.object({
  email: EmailSchema,
});

export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ForgotPasswordResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string().describe("Success message (always returns success to prevent email enumeration)"),
  }),
});

export type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponseSchema>;

/**
 * GET /api/v1/auth/local/validate-reset-token - Validate password reset token
 */
export const ValidateResetTokenQuerySchema = TokenQuerySchema;

export const ValidateResetTokenParamsSchema = z.object({
  token: z.string().min(1, "Reset token is required").describe("Password reset token"),
});

export type ValidateResetTokenParams = z.infer<typeof ValidateResetTokenParamsSchema>;

export const ValidateResetTokenResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    valid: z.literal(true),
  }),
});

export type ValidateResetTokenResponse = z.infer<typeof ValidateResetTokenResponseSchema>;


/**
 * POST /api/v1/auth/local/reset-password - Reset password with token
 */
export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1, "Reset token is required").describe("Password reset token"),
  password: PasswordSchema,
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const ResetPasswordResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string().describe("Success message"),
  }),
});

export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;
