/**
 * JWT utilities
 */
import { sign } from "hono/jwt";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION_HOURS = 8; // 8 hours

// Validate JWT_SECRET in production
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET environment variable must be set in production");
}

// Use a dev secret only in development/test with warning
const SECRET: string = JWT_SECRET || (() => {
  console.warn("⚠️  WARNING: Using default JWT_SECRET. Set JWT_SECRET in production!");
  return "dev-secret-change-in-production";
})();

/**
 * JWT Payload structure using standard claims
 * - sub: Subject (user ID) - Standard JWT claim
 * - email: User email - Custom claim
 * - role: User role - Custom claim
 * - iat: Issued at - Standard JWT claim
 * - exp: Expiration - Standard JWT claim
 */
export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: "admin" | "operator";
  iat?: number;
  exp?: number;
}

/**
 * Get the JWT secret (for use in middleware)
 * @returns JWT secret string
 */
export function getJWTSecret(): string {
  return SECRET;
}

/**
 * Sign a JWT access token
 * @param payload - Token payload (accepts userId, maps to sub)
 * @returns Signed JWT string
 */
export async function signAccessToken(
  payload: { userId: string; email: string; role: "admin" | "operator" }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_EXPIRATION_HOURS * 60 * 60;

  return await sign(
    {
      sub: payload.userId,
      email: payload.email,
      role: payload.role,
      iat: now,
      exp,
    },
    SECRET
  );
}
