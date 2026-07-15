/**
 * Local password authentication routes
 */
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { describeRoute, resolver, validator } from "hono-openapi";
import { User } from "../models/User";
import { Invite } from "../models/Invite";
import { PasswordResetToken } from "../models/PasswordResetToken";
import { hashTokenSha256, randomToken } from "../utils/crypto";
import { signAccessToken } from "../auth/jwt";
import { sendPasswordResetEmail } from "../email/mailer";
import { loginRateLimiter, passwordResetRateLimiter } from "../middleware/rate-limit";
import {
  SetupRequestSchema,
  SetupResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  ForgotPasswordRequestSchema,
  ForgotPasswordResponseSchema,
  ValidateResetTokenQuerySchema,
  ValidateResetTokenResponseSchema,
  ResetPasswordRequestSchema,
  ResetPasswordResponseSchema,
  ErrorSchema,
} from "../schemas/auth-local";

/**
 * POST /api/auth/local/setup - Setup password for invited user
 * POST /api/auth/local/login - Login with email and password
 * POST /api/auth/local/forgot-password - Request password reset
 * GET /api/auth/local/validate-reset-token - Validate password reset token
 * POST /api/auth/local/reset-password - Reset password with token
 */
const app = new Hono()
  .post(
    "/setup",
    describeRoute({
      description: "Setup password for an invited user using invite token",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Password setup successful, user created",
          content: {
            "application/json": {
              schema: resolver(SetupResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid or expired invite token, or validation error",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("json", SetupRequestSchema),
    async (c) => {
      const { inviteToken, password, name } = c.req.valid("json");

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
        name,
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
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    }
  )
  .post(
    "/login",
    describeRoute({
      description: "Authenticate user with email and password",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Login successful",
          content: {
            "application/json": {
              schema: resolver(LoginResponseSchema),
            },
          },
        },
        401: {
          description: "Invalid credentials",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        403: {
          description: "Account is disabled",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    loginRateLimiter,
    validator("json", LoginRequestSchema),
    async (c) => {
      const { email, password } = c.req.valid("json");

      // Find user
      const user = await User.findOne({ email });
      
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
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    }
  )
  .post(
    "/forgot-password",
    describeRoute({
      description: "Request password reset email (always returns success to prevent email enumeration)",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Request processed (email sent if user exists)",
          content: {
            "application/json": {
              schema: resolver(ForgotPasswordResponseSchema),
            },
          },
        },
      },
    }),
    passwordResetRateLimiter,
    validator("json", ForgotPasswordRequestSchema),
    async (c) => {
      const { email } = c.req.valid("json");

      // Always return success to prevent email enumeration
      const successResponse = {
        success: true,
        message: "Se l'email esiste, riceverai un link per reimpostare la password",
      };

      try {
        // Find user
        const user = await User.findOne({ email });
        
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
    }
  )
  .get(
    "/validate-reset-token",
    describeRoute({
      description: "Validate password reset token without consuming it",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Token is valid",
          content: {
            "application/json": {
              schema: resolver(ValidateResetTokenResponseSchema),
            },
          },
        },
        400: {
          description: "Token has expired",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        404: {
          description: "Token not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("query", ValidateResetTokenQuerySchema),
    async (c) => {
      const { token } = c.req.valid("query");

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
    }
  )
  .post(
    "/reset-password",
    describeRoute({
      description: "Reset password using valid reset token (one-time use)",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Password reset successful",
          content: {
            "application/json": {
              schema: resolver(ResetPasswordResponseSchema),
            },
          },
        },
        400: {
          description: "Token has expired or validation error",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        404: {
          description: "Token or user not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("json", ResetPasswordRequestSchema),
    async (c) => {
      const { token, password } = c.req.valid("json");

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

      // Mark token as used
      resetToken.usedAt = new Date();
      await resetToken.save();

      // Delete the reset token (one-time use)
      await PasswordResetToken.findByIdAndDelete(resetToken._id);

      return c.json({
        success: true,
        message: "Password reset successfully",
      });
    }
  );

export default app;
export type AppType = typeof app;
