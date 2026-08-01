/**
 * Common validation schemas
 * 
 * Shared schemas used across multiple routes
 */
import { z } from "zod";

/**
 * Standard error response schema
 */
export const ErrorSchema = z.object({
  error: z.string().describe("Error message describing what went wrong"),
});

/**
 * Standard success response schema
 */
export const SuccessSchema = z.object({
  success: z.literal(true),
  message: z.string().optional().describe("Optional success message"),
});

/**
 * Email validation schema with normalization
 */
export const EmailSchema = z
  .email("Invalid email format")
  .transform((email) => email.toLowerCase().trim())
  .describe("Email address");

/**
 * Password validation schema
 */
export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .describe("User password (minimum 8 characters)");

/**
 * User role enum
 */
export const UserRoleSchema = z
  .enum(["admin", "operator"])
  .describe("User role in the system");

/**
 * User response schema
 */
export const UserSchema = z.object({
  id: z.string().describe("Unique user identifier"),
  email: z.email().describe("User email address"),
  role: UserRoleSchema,
  isDisabled: z.boolean().optional().describe("Whether the user account is disabled"),
  lastLoginAt: z.iso.datetime().optional().describe("Timestamp of last login"),
});

/**
 * Query token parameter schema
 */
export const TokenQuerySchema = z.object({
  token: z.string().min(1, "Token is required").describe("Authentication or validation token"),
});
