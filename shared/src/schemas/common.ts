/**
 * Common validation schemas
 * 
 * Shared schemas used across multiple routes
 */

import { z } from "zod";
import { SUPPORTED_LOCALES } from "../i18n";

/**
 * Standard error response schema
 *
 * `code` is a machine-readable `ErrorCode` (see `shared/src/error-codes.ts`)
 * that the web app maps to a localized message; `error` is the English
 * fallback string.
 */
export const ErrorSchema = z.object({
  error: z.string().describe("Error message describing what went wrong"),
  code: z.string().optional().describe("Machine-readable error code"),
});

export const HealthResponseSchema = z.object({
  status: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorSchema>;

/**
 * Standard success response schema
 */
export const SuccessSchema = z.object({
  success: z.literal(true),
  message: z.string().optional().describe("Optional success message"),
});

export type SuccessResponse = z.infer<typeof SuccessSchema>;

/**
 * Standard delete response schema
 */
export const DeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().describe("Confirmation message"),
});

export type DeleteResponse = z.infer<typeof DeleteResponseSchema>;

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
 * Supported UI locale enum (see shared/src/i18n.ts)
 */
export const LocaleSchema = z
  .enum(SUPPORTED_LOCALES)
  .describe("Supported UI locale");

/**
 * User role enum
 */
export const UserRoleSchema = z
  .enum(["admin", "operator"])
  .describe("User role in the system");

export type UserRole = z.infer<typeof UserRoleSchema>;

/**
 * MongoDB ObjectId validation schema
 */
export const ObjectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ObjectId format")
  .describe("MongoDB ObjectId");

/**
 * Path parameter schema for a resource identified by an ObjectId
 */
export const ObjectIdParamSchema = z.object({
  id: ObjectIdSchema.describe("Resource identifier"),
});

/**
 * User response schema
 */
export const UserSchema = z.object({
  id: ObjectIdSchema.describe("Unique user identifier"),
  email: z.email().describe("User email address"),
  name: z.string().optional().describe("User display name"),
  role: UserRoleSchema,
  isDisabled: z.boolean().optional().describe("Whether the user account is disabled"),
  language: LocaleSchema.optional().describe("Preferred UI locale used for emails"),
  lastLoginAt: z.iso.datetime().optional().describe("Timestamp of last login"),
  createdAt: z.iso.datetime().optional().describe("Account creation timestamp"),
});

export type User = z.infer<typeof UserSchema>;

/**
 * Public user projection (no audit/timestamps) — used in auth responses
 */
export const PublicUserSchema = UserSchema.pick({
  id: true,
  email: true,
  name: true,
  role: true,
  language: true,
});

export type PublicUser = z.infer<typeof PublicUserSchema>;

/**
 * Request body to update the current user's preferred language
 */
export const UpdateLanguageRequestSchema = z.object({
  language: LocaleSchema.describe("New preferred locale"),
});

export type UpdateLanguageRequest = z.infer<typeof UpdateLanguageRequestSchema>;

/**
 * Query token parameter schema
 */
export const TokenQuerySchema = z.object({
  token: z.string().min(1, "Token is required").describe("Authentication or validation token"),
});

/**
 * Building status enum
 */
export const BuildingStatusSchema = z
  .enum(["active", "inactive", "decommissioned"])
  .describe("Building operational status");

export type BuildingStatus = z.infer<typeof BuildingStatusSchema>;

/**
 * Sensor type enum
 */
export const SensorTypeSchema = z
  .enum(["internal_temp", "external_temp", "energy_meter", "gas_meter"])
  .describe("Type of sensor (internal temperature, external temperature, energy meter, or gas meter)");

export type SensorType = z.infer<typeof SensorTypeSchema>;

/**
 * Sensor status enum
 */
export const SensorStatusSchema = z
  .enum(["active", "inactive", "maintenance", "error"])
  .describe("Sensor operational status");

export type SensorStatus = z.infer<typeof SensorStatusSchema>;

/**
 * Heating system type
 */
export const HeatingSystemTypeSchema = z.string().describe("Type of heating system");

/**
 * Pagination query parameters
 */
export const PaginationQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .pipe(z.number().min(1).max(100))
    .describe("Maximum number of results (1-100, default: 50)"),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0))
    .pipe(z.number().min(0))
    .describe("Number of results to skip (default: 0)"),
});

export type PaginationQuery = z.input<typeof PaginationQuerySchema>;

/**
 * Sort order enum
 */
export const SortOrderSchema = z
  .enum(["asc", "desc"])
  .describe("Sort order (ascending or descending)");

export type SortOrder = z.infer<typeof SortOrderSchema>;

/**
 * Pagination metadata included in list responses
 */
export const PaginationResponseSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  total: z.number(),
}).describe("Pagination information");

export type PaginationResponse = z.infer<typeof PaginationResponseSchema>;

/**
 * Inclusive date range used in period-based responses
 */
export const PeriodSchema = z.object({
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime(),
});

export type Period = z.infer<typeof PeriodSchema>;
