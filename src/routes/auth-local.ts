/**
 * Local password authentication routes
 */
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { User } from "../models/User";
import { Invite } from "../models/Invite";
import { PasswordResetToken } from "../models/PasswordResetToken";
import { hashTokenSha256, randomToken } from "../utils/crypto";
import { signAccessToken } from "../auth/jwt";
import { sendPasswordResetEmail } from "../email/mailer";
import { isValidEmail, normalizeEmail } from "../utils/validation";
import { loginRateLimiter, passwordResetRateLimiter } from "../middleware/rate-limit";

/**
 * POST /api/auth/local/setup - Setup password for invited user
 * POST /api/auth/local/login - Login with email and password
 * POST /api/auth/local/forgot-password - Request password reset
 * GET /api/auth/local/validate-reset-token - Validate password reset token
 * POST /api/auth/local/reset-password - Reset password with token
 */
const app = new Hono()
  .post("/setup", async (c) => {
    const body = await c.req.json();
    const { inviteToken, password } = body;

    if (!inviteToken || !password) {
      return c.json({ error: "inviteToken and password are required" }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Validate invite
    const tokenHash = hashTokenSha256(inviteToken);
    const invite = await Invite.findOne({ tokenHash, status: "pending" });

    if (!invite) {
      return c.json({ error: "Invalid or already used invite" }, 400);
    }

    if (invite.expiresAt < new Date()) {
      invite.status = "expired";
      await invite.save();
      return c.json({ error: "Invite has expired" }, 400);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: invite.email });
    if (existingUser) {
      return c.json({ error: "User already exists" }, 400);
    }

    // Hash password using Bun's built-in password hasher
    const passwordHash = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 10,
    });

    // Create user
    const user = await User.create({
      email: invite.email,
      role: invite.role,
      isDisabled: false,
      passwordHash,
      passwordUpdatedAt: new Date(),
    });

    // Mark invite as accepted
    invite.status = "accepted";
    invite.acceptedAt = new Date();
    await invite.save();

    // Sign JWT
    const token = await signAccessToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    // Set httpOnly cookie
    const isProduction = process.env.NODE_ENV === "production";
    setCookie(c, "access_token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "Lax",
      maxAge: 8 * 60 * 60, // 8 hours
      path: "/",
    });

    return c.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  })
  .post("/login", loginRateLimiter, async (c) => {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: "email and password are required" }, 400);
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return c.json({ error: "Invalid email format" }, 400);
    }

    // Find user
    const user = await User.findOne({ email: normalizeEmail(email) });
    
    // Always hash a dummy password to prevent timing attacks
    // This ensures consistent response time whether user exists or not
    // This is a valid bcrypt hash of the word "dummy" - it will never match user input
    const dummyHash = "$2b$10$MvnUwJXiCB54FF.gtOVq4.c.NHMOjNehZ1m7S0QXTFjxB0DjGIh0.";
    const passwordHash = user?.passwordHash || dummyHash;
    
    // Verify password (will fail for dummy hash)
    const valid = await Bun.password.verify(password, passwordHash);
    
    // Check if user exists and has password after verification
    if (!user || !user.passwordHash || !valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    if (user.isDisabled) {
      return c.json({ error: "Account is disabled" }, 403);
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Sign JWT
    const token = await signAccessToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    // Set httpOnly cookie
    const isProduction = process.env.NODE_ENV === "production";
    setCookie(c, "access_token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "Lax",
      maxAge: 8 * 60 * 60, // 8 hours
      path: "/",
    });

    return c.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  })
  .post("/forgot-password", passwordResetRateLimiter, async (c) => {
    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json({ error: "email is required" }, 400);
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return c.json({ error: "Invalid email format" }, 400);
    }

    // Always return success to prevent email enumeration
    const successResponse = {
      success: true,
      message: "Se l'email esiste, riceverai un link per reimpostare la password",
    };

    try {
      // Find user
      const user = await User.findOne({ email: normalizeEmail(email) });
      
      // Only send email if user exists and has a password
      if (user && user.passwordHash) {
        // Delete any existing reset tokens for this user
        await PasswordResetToken.deleteMany({ userId: user._id });

        // Generate new token
        const token = randomToken(32);
        const tokenHash = hashTokenSha256(token);

        // Create reset token (expires in 1 hour)
        await PasswordResetToken.create({
          userId: user._id,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        });

        // Send email
        await sendPasswordResetEmail(user.email, token);
      }

      return c.json(successResponse);
    } catch (err) {
      console.error("Password reset error:", err);
      return c.json(successResponse); // Still return success to prevent enumeration
    }
  })
  .get("/validate-reset-token", async (c) => {
    const token = c.req.query("token");

    if (!token) {
      return c.json({ error: "Token required" }, 400);
    }

    const tokenHash = hashTokenSha256(token);
    const resetToken = await PasswordResetToken.findOne({ tokenHash });

    if (!resetToken) {
      return c.json({ error: "Invalid reset token" }, 404);
    }

    if (resetToken.expiresAt < new Date()) {
      await PasswordResetToken.findByIdAndDelete(resetToken._id);
      return c.json({ error: "Reset token has expired" }, 400);
    }

    return c.json({ valid: true });
  })
  .post("/reset-password", async (c) => {
    const body = await c.req.json();
    const { token, password } = body;

    if (!token || !password) {
      return c.json({ error: "token and password are required" }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Find reset token
    const tokenHash = hashTokenSha256(token);
    const resetToken = await PasswordResetToken.findOne({ tokenHash });

    if (!resetToken) {
      return c.json({ error: "Invalid reset token" }, 404);
    }

    if (resetToken.expiresAt < new Date()) {
      await PasswordResetToken.findByIdAndDelete(resetToken._id);
      return c.json({ error: "Reset token has expired" }, 400);
    }

    // Find user
    const user = await User.findById(resetToken.userId);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Hash new password
    const passwordHash = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 10,
    });

    // Update user password
    user.passwordHash = passwordHash;
    user.passwordUpdatedAt = new Date();
    await user.save();

    // Mark token as used (before deletion for audit trail)
    resetToken.usedAt = new Date();
    await resetToken.save();

    // Delete the reset token (one-time use)
    await PasswordResetToken.findByIdAndDelete(resetToken._id);

    return c.json({
      success: true,
      message: "Password reset successfully",
    });
  });

export default app;
export type AppType = typeof app;
