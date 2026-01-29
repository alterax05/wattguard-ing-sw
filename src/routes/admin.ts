/**
 * Admin routes
 * 
 * All routes in this file are protected by JWT authentication and admin role requirement,
 * applied globally in src/index.ts
 */
import { Hono } from "hono";
import type { AuthVariables, JWTPayload } from "../middleware/auth";
import { Invite } from "../models/Invite";
import { User } from "../models/User";
import { randomToken, hashTokenSha256 } from "../utils/crypto";
import { sendInviteEmail } from "../email/mailer";
import { isValidEmail, normalizeEmail } from "../utils/validation";
import { inviteRateLimiter } from "../middleware/rate-limit";

/**
 * GET /api/admin/invites - List all invites
 * POST /api/admin/invites - Create a new invite
 * POST /api/admin/invites/:id/revoke - Revoke an invite
 * 
 * Note: JWT authentication and admin role middleware are applied globally in index.ts
 */
const app = new Hono<{ Variables: AuthVariables }>()
  .get("/invites", async (c) => {
    const invites = await Invite.find()
      .sort({ createdAt: -1 })
      .populate("createdBy", "email")
      .limit(100);

    return c.json({ invites });
  })
  .post("/invites", inviteRateLimiter, async (c) => {
    const payload = c.get("jwtPayload") as JWTPayload;
    const body = await c.req.json();

    const { email, role } = body;

    if (!email || !role) {
      return c.json({ error: "email and role are required" }, 400);
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return c.json({ error: "Invalid email format" }, 400);
    }

    if (!["admin", "operator"].includes(role)) {
      return c.json({ error: "role must be admin or operator" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return c.json({ error: "User with this email already exists" }, 400);
    }

    // Check if there's already a pending invite
    const existingInvite = await Invite.findOne({
      email: normalizedEmail,
      status: "pending",
      expiresAt: { $gt: new Date() },
    });

    if (existingInvite) {
      return c.json({ error: "A pending invite already exists for this email" }, 400);
    }

    // Generate token
    const token = randomToken(32);
    const tokenHash = hashTokenSha256(token);

    // Create invite (using sub claim which contains the user ID)
    const invite = await Invite.create({
      email: normalizedEmail,
      role,
      tokenHash,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      createdBy: payload.sub,
    });

    // Send email
    try {
      await sendInviteEmail(normalizedEmail, token, role);
    } catch (err) {
      console.error("Failed to send invite email:", err);
      // Delete the invite if email fails
      await Invite.findByIdAndDelete(invite._id);
      return c.json({ error: "Failed to send invite email. Check SMTP configuration." }, 500);
    }

    return c.json({
      success: true,
      invite: {
        id: invite._id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
      },
    }, 201);
  })
  .post("/invites/:id/revoke", async (c) => {
    const id = c.req.param("id");

    const invite = await Invite.findById(id);
    if (!invite) {
      return c.json({ error: "Invite not found" }, 404);
    }

    if (invite.status !== "pending") {
      return c.json({ error: "Can only revoke pending invites" }, 400);
    }

    invite.status = "revoked";
    await invite.save();

    return c.json({ success: true, invite });
  });

export default app;
export type AppType = typeof app;
