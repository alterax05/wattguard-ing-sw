/**
 * JWT utilities
 */
import { sign } from "hono/jwt";
import { JWT_SECRET } from "../config/variables";

const JWT_EXPIRATION_HOURS = 8; // 8 hours

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
 * Sign a JWT access token
 * @param payload - Token payload (accepts userId, maps to sub)
 * @returns Signed JWT string
 */
export async function signAccessToken(
  payload: { userId: string; email: string; role: "admin" | "operator" }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_EXPIRATION_HOURS * 60 * 60;

  return sign(
    {
      sub: payload.userId,
      email: payload.email,
      role: payload.role,
      iat: now,
      exp,
    },
    JWT_SECRET
  );
}
