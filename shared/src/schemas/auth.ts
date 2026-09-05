/**
 * Authentication and Session schemas
 * 
 * Routes: /api/v1/auth/session, /api/v1/auth/google/config
 */
import { z } from "zod";
import { PublicUserSchema, UserSchema } from "./common";
import { SUPPORTED_LOCALES } from "../i18n";

/**
 * Local email/password session creation request
 */
export const LocalSessionRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
}).meta({ id: "LocalSessionRequest" });

export type LocalSessionRequest = z.infer<typeof LocalSessionRequestSchema>;

/**
 * Google ID token session creation request
 */
export const GoogleSessionRequestSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required"),
}).meta({ id: "GoogleSessionRequest" });

export type GoogleSessionRequest = z.infer<typeof GoogleSessionRequestSchema>;

/**
 * Unified session creation request schema (local or Google)
 */
export const SessionRequestSchema = z.union([
  LocalSessionRequestSchema,
  GoogleSessionRequestSchema,
]).meta({ id: "SessionRequest" });

export type SessionRequest = z.infer<typeof SessionRequestSchema>;

/**
 * Successful session creation response
 */
export const SessionResponseSchema = z.object({
  success: z.literal(true),
  data: PublicUserSchema,
}).meta({ id: "SessionResponse" });

export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/**
 * GET /api/v1/auth/session - Current session / user response
 */
export const SessionUserResponseSchema = z.object({
  success: z.literal(true),
  data: UserSchema,
}).meta({ id: "SessionUserResponse" });

export type SessionUserResponse = z.infer<typeof SessionUserResponseSchema>;

/**
 * PATCH /api/v1/auth/session - Update current session / user profile
 */
export const UpdateSessionRequestSchema = z.object({
  language: z.enum(SUPPORTED_LOCALES).optional().describe("User preferred language for email alerts and UI"),
  name: z.string().min(2).max(64).optional().describe("User display name"),
}).meta({ id: "UpdateSessionRequest" });

export type UpdateSessionRequest = z.infer<typeof UpdateSessionRequestSchema>;

/**
 * DELETE /api/v1/auth/session - Destroy session response
 */
export const DestroySessionResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string().optional().describe("Success message"),
  }),
}).meta({ id: "DestroySessionResponse" });

export type DestroySessionResponse = z.infer<typeof DestroySessionResponseSchema>;

/**
 * GET /api/v1/auth/google/config - Public Google Client ID response
 */
export const GoogleConfigResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    clientId: z.string().describe("Configured Google OAuth Client ID"),
  }),
}).meta({ id: "GoogleConfigResponse" });

export type GoogleConfigResponse = z.infer<typeof GoogleConfigResponseSchema>;
