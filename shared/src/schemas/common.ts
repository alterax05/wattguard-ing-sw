/**
 * Common validation schemas
 * 
 * Shared schemas used across multiple routes
 */

import { z } from "zod";
import { SUPPORTED_LOCALES } from "../i18n";

/**
 * Interpolation values for the localized `errors.*` message (e.g. `{ count }`
 * for `building_type_in_use`). Only string/number primitives so they can be
 * passed straight to i18next.
 */
export const ErrorDetailsSchema = z
  .record(z.string(), z.union([z.string(), z.number()]))
  .describe("Interpolation values for the localized error message");

export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>;

/**
 * Standard error response schema
 *
 * `code` is a machine-readable `ErrorCode` (see `shared/src/error-codes.ts`)
 * that the web app maps to a localized message; `error` is the English
 * fallback string.
 */
export const ErrorSchema = z.object({
  success: z.literal(false).describe("Indicates failure"),
  error_code: z.string().describe("Machine-readable error code"),
  message: z.string().describe("Error message describing what went wrong"),
  details: ErrorDetailsSchema.optional().describe("Interpolation values for the localized error message"),
});

export type ErrorResponse = z.infer<typeof ErrorSchema>;

export type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

export const HealthResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.string(),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * Email validation schema with normalization
 */
export const EmailSchema = z
  .email("Invalid email format")
  .transform((email) => email.toLowerCase().trim())
  .describe("Email address");

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
 * Canonical URI link to this resource
 */
export const SelfLinkSchema = z.string().describe("Canonical URI link to this resource");

/**
 * MongoDB ObjectId validation schema
 */
export const ObjectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ObjectId format")
  .describe("MongoDB ObjectId");

/**
 * Accepts both a raw MongoDB ObjectId and a full resource URI (e.g. /api/v1/buildings/64...)
 * extracting the trailing ID segment.
 */
export const ResourceIdOrUriSchema = z
  .string()
  .transform((val) => {
    const parts = val.trim().split("/");
    return parts[parts.length - 1];
  })
  .pipe(ObjectIdSchema)
  .describe("MongoDB ObjectId or resource URI");

/**
 * ISO 8601 DateTime schema
 * Accepts ISO string or JavaScript Date instance, serializing to ISO 8601 string.
 */
export const IsoDateTimeSchema = z.union([
  z.iso.datetime().describe("ISO 8601 timestamp string"),
  z.date().transform((d) => d.toISOString()),
]);

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
  self: SelfLinkSchema.optional(),
  _id: ObjectIdSchema.describe("Unique user identifier"),
  email: z.email().describe("User email address"),
  name: z.string().nullish().transform((v) => v ?? undefined).optional().describe("User display name"),
  role: UserRoleSchema,
  isDisabled: z.boolean().optional().describe("Whether the user account is disabled"),
  language: LocaleSchema.nullish().transform((v) => v ?? undefined).optional().describe("Preferred UI locale used for emails"),
  lastLoginAt: IsoDateTimeSchema.nullish().transform((v) => v ?? undefined).optional().describe("Timestamp of last login"),
  createdAt: IsoDateTimeSchema.optional().describe("Account creation timestamp"),
});

export type User = z.infer<typeof UserSchema>;

/**
 * Public user projection (no audit/timestamps) — used in auth responses
 */
export const PublicUserSchema = UserSchema.omit({
  isDisabled: true,
  lastLoginAt: true,
  createdAt: true
});


export type PublicUser = z.infer<typeof PublicUserSchema>;

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

/** Adds a string `id` param to a request payload (e.g. update mutations). */
export type WithId<T> = T & { id: string };
