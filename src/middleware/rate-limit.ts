/**
 * Rate limiting middleware
 */
import { rateLimiter } from "hono-rate-limiter";

/**
 * Rate limiter for login attempts
 * 5 attempts per 15 minutes per IP
 */
export const loginRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: process.env.NODE_ENV === "test" ? 1000 : 10, // High limit in test
  standardHeaders: "draft-6", // Add rate limit headers
  keyGenerator: (c) => {
    // Use IP address as key
    return c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  },
});

/**
 * Rate limiter for password reset requests
 * 3 attempts per hour per IP
 */
export const passwordResetRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: process.env.NODE_ENV === "test" ? 1000 : 3, // High limit in test
  standardHeaders: "draft-6",
  keyGenerator: (c) => {
    return c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  },
});

/**
 * Rate limiter for invite creation
 * 10 invites per hour per user
 */
export const inviteRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: process.env.NODE_ENV === "test" ? 1000 : 10,
  standardHeaders: "draft-6",
  keyGenerator: (c) => {
    return c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  },
});
