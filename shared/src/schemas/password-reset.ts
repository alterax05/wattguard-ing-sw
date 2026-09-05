import { z } from "zod";

/**
 * POST /api/v1/auth/recovery-tokens - Request password recovery token.
 * Secret never appears in a URL. Server never reveals whether the email exists.
 */
export const CreateRecoveryTokenRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
}).meta({ id: "CreateRecoveryTokenRequest" });

export type CreateRecoveryTokenRequest = z.infer<typeof CreateRecoveryTokenRequestSchema>;

export const CreateRecoveryTokenResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string().describe("Success message"),
  }),
}).meta({ id: "CreateRecoveryTokenResponse" });

export type CreateRecoveryTokenResponse = z.infer<typeof CreateRecoveryTokenResponseSchema>;

/**
 * POST /api/v1/auth/recovery-validations - Validate recovery token.
 * Token travels in the JSON body, never in the path or query string,
 * so it does not land in access logs or proxy logs.
 */
export const ValidateRecoveryTokenRequestSchema = z.object({
  token: z.string().min(1, "Token is required"),
}).meta({ id: "ValidateRecoveryTokenRequest" });

export type ValidateRecoveryTokenRequest = z.infer<typeof ValidateRecoveryTokenRequestSchema>;

export const ValidateRecoveryTokenResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    valid: z.literal(true),
  }),
}).meta({ id: "ValidateRecoveryTokenResponse" });

export type ValidateRecoveryTokenResponse = z.infer<typeof ValidateRecoveryTokenResponseSchema>;

/**
 * POST /api/v1/auth/recovery-confirmations - Confirm recovery with token.
 * Single use: consumes the token and sets the new password.
 */
export const ConfirmRecoveryRequestSchema = z.object({
  token: z.string().min(1, "Recovery token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters"),
}).meta({ id: "ConfirmRecoveryRequest" });

export type ConfirmRecoveryRequest = z.infer<typeof ConfirmRecoveryRequestSchema>;

export const ConfirmRecoveryResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string().describe("Success message"),
  }),
}).meta({ id: "ConfirmRecoveryResponse" });

export type ConfirmRecoveryResponse = z.infer<typeof ConfirmRecoveryResponseSchema>;
