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

/**
 * MongoDB ObjectId validation schema
 */
export const ObjectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ObjectId format")
  .describe("MongoDB ObjectId");

/**
 * Building status enum
 */
export const BuildingStatusSchema = z
  .enum(["active", "inactive", "decommissioned"])
  .describe("Building operational status");

/**
 * Sensor type enum
 */
export const SensorTypeSchema = z
  .enum(["internal_temp", "external_temp", "energy_meter"])
  .describe("Type of sensor (internal temperature, external temperature, or energy meter)");

/**
 * Sensor status enum
 */
export const SensorStatusSchema = z
  .enum(["active", "inactive", "maintenance", "error"])
  .describe("Sensor operational status");

/**
 * Heating system type enum (common types in Italy)
 */
export const HeatingSystemTypeSchema = z
  .enum([
    "caldaia_gas",
    "caldaia_gasolio",
    "pompa_calore",
    "teleriscaldamento",
    "stufa_pellet",
    "fotovoltaico",
    "altro",
  ])
  .describe("Type of heating system");

/**
 * Audit entity type enum
 */
export const AuditEntityTypeSchema = z
  .enum(["building", "sensor"])
  .describe("Type of entity being audited");

/**
 * Audit action enum
 */
export const AuditActionSchema = z
  .enum(["create", "update", "delete"])
  .describe("Type of action performed on the entity");

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

/**
 * Sort order enum
 */
export const SortOrderSchema = z
  .enum(["asc", "desc"])
  .describe("Sort order (ascending or descending)");
