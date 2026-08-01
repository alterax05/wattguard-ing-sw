/**
 * Authentication middleware for Hono
 * Uses Hono's built-in JWT middleware with custom user loading and role checking
 */
import { createMiddleware } from "hono/factory";
import type { JwtVariables } from "hono/jwt";
import { User, type IUser } from "../models/User";
import type { AccessTokenPayload } from "../auth/jwt";

/**
 * Extend Hono's JwtVariables with our custom userDoc
 */
export type AuthVariables = JwtVariables<AccessTokenPayload> & {
  userDoc: IUser;
};

/**
 * Type alias for our JWT payload structure
 */
export type JWTPayload = AccessTokenPayload;

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
    return c.json({ error: "Unauthorized: Invalid token payload" }, 401);
  }

  // Fetch user from DB to ensure still exists and not disabled
  const userDoc = await User.findById(payload.sub);
  if (!userDoc) {
    return c.json({ error: "Unauthorized: User not found" }, 401);
  }

  if (userDoc.isDisabled) {
    return c.json({ error: "Forbidden: Account disabled" }, 403);
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
export const requireRole = (...roles: ("admin" | "operator")[]) => 
  createMiddleware<{
    Variables: JwtVariables<AccessTokenPayload>;
  }>(async (c, next) => {
    const payload = c.get("jwtPayload");

    if (!payload) {
      return c.json(
        { error: "Forbidden: Authentication required" },
        403
      );
    }

    if (!roles.includes(payload.role)) {
      return c.json(
        { error: `Forbidden: Requires one of: ${roles.join(", ")}` },
        403
      );
    }

    await next();
  });
