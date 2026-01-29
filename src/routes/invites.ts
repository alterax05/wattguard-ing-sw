/**
 * Invite routes (public)
 */
import { Hono } from "hono";
import { Invite } from "../models/Invite";
import { hashTokenSha256 } from "../utils/crypto";

/**
 * Public: Validate an invite token
 * GET /api/invites/validate?token=...
 */
const app = new Hono()
  .get("/validate", async (c) => {
    const token = c.req.query("token");

    if (!token) {
      return c.json({ error: "Token required" }, 400);
    }

    const tokenHash = hashTokenSha256(token);
    const invite = await Invite.findOne({ tokenHash });

    if (!invite) {
      return c.json({ error: "Invalid invite token" }, 404);
    }

    if (invite.status !== "pending") {
      return c.json({ error: `Invite is ${invite.status}` }, 400);
    }

    if (invite.expiresAt < new Date()) {
      // Mark as expired
      invite.status = "expired";
      await invite.save();
      return c.json({ error: "Invite has expired" }, 400);
    }

    return c.json({
      valid: true,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    });
  });

export default app;
export type AppType = typeof app;
