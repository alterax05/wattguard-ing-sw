import { z } from "zod";

/**
 * POST /api/v1/auth/reset-tokens - Request password reset token
 */
export const CreateResetTokenRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type CreateResetTokenRequest = z.infer<typeof CreateResetTokenRequestSchema>;

export const CreateResetTokenResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string().describe("Success message"),
  }),
});

export type CreateResetTokenResponse = z.infer<typeof CreateResetTokenResponseSchema>;

/**
 * GET /api/v1/auth/reset-tokens/:token - Validate reset token
 */
export const ValidateResetTokenParamsSchema = z.object({
  token: z.string().min(1, "Token is required"),
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
 * POST /api/v1/auth/password-resets - Apply password reset with token
 */
export const ApplyPasswordResetRequestSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters"),
});

export type ApplyPasswordResetRequest = z.infer<typeof ApplyPasswordResetRequestSchema>;

export const ApplyPasswordResetResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string().describe("Success message"),
  }),
});

export type ApplyPasswordResetResponse = z.infer<typeof ApplyPasswordResetResponseSchema>;
