/**
 * Authentication middleware for Hono
 * Uses Hono's built-in JWT middleware with custom user loading and role checking
 */
import { createMiddleware } from "hono/factory";
import type { JwtVariables } from "hono/jwt";
import type { HydratedDocument } from "mongoose";
import { User, type UserDocument } from "../models/User";
import type { AccessTokenPayload } from "../auth/jwt";
import type { ErrorResponse, UserRole } from "@wattguard/shared";
import { apiError } from "../lib/api-response";

/**
 * Extend Hono's JwtVariables with our custom userDoc
 */
export type AuthVariables = JwtVariables<AccessTokenPayload> & {
  userDoc: HydratedDocument<UserDocument>;
};

/**
 * Middleware to load user document from database after JWT verification
 * Must be used after Hono's jwt() middleware
 * 
 * This middleware:
 * - Fetches the user from MongoDB using the sub (userId) claim
 * - Checks if the user exists
 * - Checks if the user is disabled
 * - Attaches userDoc to context for downstream use
 */
export const loadUserDoc = () => createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  const payload = c.get("jwtPayload");

  if (!payload || !payload.sub) {
    return c.json(apiError("unauthorized_invalid_token", "Unauthorized: Invalid token payload") satisfies ErrorResponse, 401);
  }

  // Fetch user from DB to ensure still exists and not disabled
  const userDoc = await User.findById(payload.sub);
  if (!userDoc) {
    return c.json(apiError("unauthorized_user_not_found", "Unauthorized: User not found") satisfies ErrorResponse, 401);
  }

  if (userDoc.isDisabled) {
    return c.json(apiError("account_disabled", "Forbidden: Account disabled") satisfies ErrorResponse, 403);
  }

  // Attach userDoc to context
  c.set("userDoc", userDoc);

  await next();
});

/**
 * Middleware to require a specific role
 * Must be used after jwt() middleware (and optionally loadUserDoc())
 * 
 * @param roles - One or more roles that are allowed to access the route
 */
export const requireRole = (...roles: UserRole[]) => 
  createMiddleware<{
    Variables: JwtVariables<AccessTokenPayload>;
  }>(async (c, next) => {
    const payload = c.get("jwtPayload");

    if (!payload) {
      return c.json(apiError("unauthorized_invalid_token", "Forbidden: Authentication required") satisfies ErrorResponse, 403);
    }

    if (!roles.includes(payload.role)) {
      return c.json(apiError("forbidden_role", `Forbidden: Requires one of: ${roles.join(", ")}`) satisfies ErrorResponse, 403);
    }

    await next();
  });
