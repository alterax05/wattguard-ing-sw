/**
 * General auth routes (me, logout, admin test email)
 * 
 * Protected routes (/me, /admin/*) have JWT authentication applied globally in src/index.ts
 */
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { AuthVariables, JWTPayload } from "../middleware/auth";
import { sendTestEmail } from "../email/mailer";

/**
 * GET /api/auth/me - Get current user (protected, middleware applied globally)
 * POST /api/auth/logout - Logout (public)
 * POST /api/auth/admin/test-email - Admin: Test SMTP configuration (protected, admin role required)
 */
const app = new Hono<{ Variables: AuthVariables }>()
  .get("/me", async (c) => {
    // JWT authentication and user loading applied globally in index.ts
    const payload = c.get("jwtPayload") as JWTPayload;
    const userDoc = c.get("userDoc");

    return c.json({
      user: {
        id: userDoc._id?.toString(),
        email: payload.email,
        role: payload.role,
        isDisabled: userDoc.isDisabled ?? false,
        lastLoginAt: userDoc.lastLoginAt,
      },
    });
  })
  .post("/logout", async (c) => {
    setCookie(c, "access_token", "", {
      maxAge: 0,
      path: "/",
    });

    return c.json({ success: true });
  })
  .post("/admin/test-email", async (c) => {
    // JWT authentication, user loading, and admin role check applied globally in index.ts
    try {
      const body = await c.req.json().catch(() => ({}));
      const to = body.to;

      await sendTestEmail(to);

      return c.json({ success: true, message: "Test email sent" });
    } catch (err) {
      console.error("Test email failed:", err);
      return c.json({ error: "Failed to send test email. Check SMTP configuration." }, 500);
    }
  });

export default app;
export type AppType = typeof app;
