/**
 * Authentication & Session routes
 * 
 * RESTful session management, password resets, and client auth configuration.
 */
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { jwt } from "hono/jwt";
import { describeRoute, resolver, validator } from "hono-openapi";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/User";
import { PasswordResetToken } from "../models/PasswordResetToken";
import { randomToken, hashTokenSha256 } from "../utils/crypto";
import { signAccessToken } from "../auth/jwt";
import { toUserDto, toPublicUserDto } from "../lib/users";
import { sendPasswordResetEmail } from "../email/mailer";
import { getRequestLocale } from "../lib/i18n";
import { loginRateLimiter, passwordResetRateLimiter } from "../middleware/rate-limit";
import { GOOGLE_CLIENT_ID, IS_PRODUCTION, JWT_SECRET } from "../config/variables";
import { loadUserDoc, type AuthVariables } from "../middleware/auth";
import { apiError, apiSuccess } from "../lib/api-response";
import {
  SessionRequestSchema,
  SessionResponseSchema,
  SessionUserResponseSchema,
  UpdateSessionRequestSchema,
  DestroySessionResponseSchema,
  GoogleConfigResponseSchema,
  CreateResetTokenRequestSchema,
  CreateResetTokenResponseSchema,
  ValidateResetTokenParamsSchema,
  ValidateResetTokenResponseSchema,
  ApplyPasswordResetRequestSchema,
  ApplyPasswordResetResponseSchema,
  ErrorSchema,
} from "@wattguard/shared";
import type {
  SessionResponse,
  SessionUserResponse,
  DestroySessionResponse,
  GoogleConfigResponse,
  CreateResetTokenResponse,
  ValidateResetTokenResponse,
  ApplyPasswordResetResponse,
  ErrorResponse,
} from "@wattguard/shared";

const requireAuth = [
  jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
  loadUserDoc(),
] as const;

const app = new Hono<{ Variables: AuthVariables }>()
  /* ── 1. Create Session (Login: local or Google) ────────────────────────── */
  .post(
    "/session",
    describeRoute({
      summary: "Crea sessione",
      description: "Crea una sessione tramite email+password o token ID Google; imposta il cookie access_token",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Session created successfully",
          content: {
            "application/json": {
              schema: resolver(SessionResponseSchema),
            },
          },
        },
        400: {
          description: "Validation error or unverified email",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        401: {
          description: "Invalid credentials or invalid Google ID token",
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
        404: {
          description: "User account not found",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
        503: {
          description: "Authentication provider not configured",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    loginRateLimiter,
    validator("json", SessionRequestSchema),
    async (c) => {
      const input = c.req.valid("json");

      let user;

      if ("idToken" in input) {
        // ── Google ID Token Authentication ──────────────────────────────
        if (!GOOGLE_CLIENT_ID) {
          return c.json(
            apiError("oauth_not_configured", "Google sign-in is not configured") satisfies ErrorResponse,
            503,
          );
        }

        const client = new OAuth2Client(GOOGLE_CLIENT_ID);
        let payload;
        try {
          const ticket = await client.verifyIdToken({
            idToken: input.idToken,
            audience: GOOGLE_CLIENT_ID,
          });
          payload = ticket.getPayload();
        } catch (err) {
          console.error("Google token verification failed:", err);
          return c.json(
            apiError("oauth_invalid_token", "Invalid or expired Google token") satisfies ErrorResponse,
            401,
          );
        }

        if (!payload || !payload.email || !payload.sub) {
          return c.json(
            apiError("oauth_invalid_token", "Invalid Google token payload") satisfies ErrorResponse,
            401,
          );
        }

        if (!payload.email_verified) {
          return c.json(
            apiError("oauth_email_not_verified", "Your Google email is not verified") satisfies ErrorResponse,
            400,
          );
        }

        const googleEmail = payload.email.toLowerCase().trim();
        const googleSub = payload.sub;
        const googleName = payload.name;

        user = await User.findOne({ email: googleEmail });
        if (!user) {
          return c.json(
            apiError("oauth_no_account", "No account found for this Google email") satisfies ErrorResponse,
            404,
          );
        }

        if (user.isDisabled) {
          return c.json(
            apiError("oauth_account_disabled", "Your account has been disabled") satisfies ErrorResponse,
            403,
          );
        }

        if (!user.googleSub) {
          user.googleSub = googleSub;
          if (!user.name && googleName) user.name = googleName;
        } else if (user.googleSub !== googleSub) {
          return c.json(
            apiError("oauth_account_mismatch", "This Google account is linked to a different user") satisfies ErrorResponse,
            400,
          );
        }
      } else {
        // ── Local Email / Password Authentication ───────────────────────
        const { email, password } = input;
        user = await User.findOne({ email });

        // Timing-attack prevention dummy hash
        const dummyHash = "$2b$10$MvnUwJXiCB54FF.gtOVq4.c.NHMOjNehZ1m7S0QXTFjxB0DjGIh0.";
        const passwordHash = user?.passwordHash || dummyHash;

        const valid = await Bun.password.verify(password, passwordHash);

        if (!user || !user.passwordHash || !valid) {
          return c.json(
            apiError("invalid_credentials", "Invalid credentials") satisfies ErrorResponse,
            401,
          );
        }

        if (user.isDisabled) {
          return c.json(
            apiError("account_disabled", "Account is disabled") satisfies ErrorResponse,
            403,
          );
        }
      }

      user.lastLoginAt = new Date();
      await user.save();

      const token = await signAccessToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      setCookie(c, "access_token", token, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: "Lax",
        maxAge: 8 * 60 * 60,
        path: "/",
      });

      return c.json(apiSuccess(toPublicUserDto(user)) satisfies SessionResponse);
    },
  )

  /* ── 2. Get Current Session / User Info ────────────────────────────────── */
  .get(
    "/session",
    ...requireAuth,
    describeRoute({
      summary: "Leggi sessione corrente",
      description: "Restituisce utente e dati della sessione autenticata",
      tags: ["Authentication"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Current user and session information",
          content: {
            "application/json": {
              schema: resolver(SessionUserResponseSchema),
            },
          },
        },
        401: {
          description: "Unauthorized - Invalid or missing JWT token",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    (c) => {
      const userDoc = c.get("userDoc");
      return c.json(apiSuccess(toUserDto(userDoc)) satisfies SessionUserResponse);
    },
  )

  /* ── 3. Update Current Session / User Profile ─────────────────────────── */
  .patch(
    "/session",
    ...requireAuth,
    describeRoute({
      summary: "Aggiorna profilo corrente",
      description: "Aggiorna nome e preferenze (es. lingua) dell'utente autenticato",
      tags: ["Authentication"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "Updated user information",
          content: {
            "application/json": {
              schema: resolver(SessionUserResponseSchema),
            },
          },
        },
        401: {
          description: "Unauthorized - Invalid or missing JWT token",
          content: {
            "application/json": {
              schema: resolver(ErrorSchema),
            },
          },
        },
      },
    }),
    validator("json", UpdateSessionRequestSchema),
    async (c) => {
      const { language, name } = c.req.valid("json");
      const userDoc = c.get("userDoc");

      if (language !== undefined) {
        userDoc.language = language;
      }
      if (name !== undefined) {
        userDoc.name = name;
      }
      await userDoc.save();

      return c.json(apiSuccess(toUserDto(userDoc)) satisfies SessionUserResponse);
    },
  )

  /* ── 4. Destroy Current Session (Logout) ───────────────────────────────── */
  .delete(
    "/session",
    describeRoute({
      summary: "Chiudi sessione",
      description: "Distrugge la sessione corrente cancellando il cookie di autenticazione",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Session destroyed successfully",
          content: {
            "application/json": {
              schema: resolver(DestroySessionResponseSchema),
            },
          },
        },
      },
    }),
    (c) => {
      setCookie(c, "access_token", "", {
        maxAge: 0,
        path: "/",
      });

      return c.json(
        apiSuccess({ message: "Session destroyed successfully" }) satisfies DestroySessionResponse,
      );
    },
  )

  /* ── 5. Public Google Client Config ───────────────────────────────────── */
  .get(
    "/google/config",
    describeRoute({
      summary: "Leggi config Google OAuth",
      description: "Restituisce il Client ID Google pubblico per l'SDK del frontend",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Google configuration",
          content: {
            "application/json": {
              schema: resolver(GoogleConfigResponseSchema),
            },
          },
        },
      },
    }),
    (c) => {
      return c.json(
        apiSuccess({ clientId: GOOGLE_CLIENT_ID }) satisfies GoogleConfigResponse,
      );
    },
  )

  /* ── 6. Request Password Reset Token ──────────────────────────────────── */
  .post(
    "/reset-tokens",
    describeRoute({
      summary: "Richiedi reset password",
      description: "Crea il token di reset e invia l'email se l'account esiste",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Request processed",
          content: {
            "application/json": {
              schema: resolver(CreateResetTokenResponseSchema),
            },
          },
        },
      },
    }),
    passwordResetRateLimiter,
    validator("json", CreateResetTokenRequestSchema),
    async (c) => {
      const { email } = c.req.valid("json");
      const successResponse = apiSuccess({
        message: "Se l'email esiste, riceverai un link per reimpostare la password",
      }) satisfies CreateResetTokenResponse;

      try {
        const user = await User.findOne({ email });
        if (user && user.passwordHash) {
          await PasswordResetToken.deleteMany({ userId: user._id });

          const token = randomToken(32);
          const tokenHash = hashTokenSha256(token);

          await PasswordResetToken.create({
            userId: user._id,
            tokenHash,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
          });

          await sendPasswordResetEmail(user.email, token, getRequestLocale(c));
        }
        return c.json(successResponse);
      } catch (err) {
        console.error("Password reset request error:", err);
        return c.json(successResponse);
      }
    },
  )

  /* ── 7. Validate Password Reset Token ─────────────────────────────────── */
  .get(
    "/reset-tokens/:token",
    describeRoute({
      summary: "Verifica token di reset",
      description: "Controlla la validità del token di reset senza consumarlo",
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
    validator("param", ValidateResetTokenParamsSchema),
    async (c) => {
      const { token } = c.req.valid("param");
      const tokenHash = hashTokenSha256(token);
      const resetToken = await PasswordResetToken.findOne({ tokenHash });

      if (!resetToken) {
        return c.json(
          apiError("invalid_reset_token", "Invalid reset token") satisfies ErrorResponse,
          404,
        );
      }

      if (resetToken.expiresAt < new Date()) {
        return c.json(
          apiError("reset_token_expired", "Reset token has expired") satisfies ErrorResponse,
          400,
        );
      }

      return c.json(
        apiSuccess({ valid: true as const }) satisfies ValidateResetTokenResponse,
      );
    },
  )

  /* ── 8. Apply Password Reset ─────────────────────────────────────────── */
  .post(
    "/password-resets",
    describeRoute({
      summary: "Reimposta password",
      description: "Reimposta la password con un token valido (uso singolo)",
      tags: ["Authentication"],
      responses: {
        200: {
          description: "Password reset successful",
          content: {
            "application/json": {
              schema: resolver(ApplyPasswordResetResponseSchema),
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
    validator("json", ApplyPasswordResetRequestSchema),
    async (c) => {
      const { token, password } = c.req.valid("json");
      const tokenHash = hashTokenSha256(token);
      const resetToken = await PasswordResetToken.findOne({ tokenHash });

      if (!resetToken) {
        return c.json(
          apiError("invalid_reset_token", "Invalid reset token") satisfies ErrorResponse,
          404,
        );
      }

      if (resetToken.expiresAt < new Date()) {
        await PasswordResetToken.findByIdAndDelete(resetToken._id);
        return c.json(
          apiError("reset_token_expired", "Reset token has expired") satisfies ErrorResponse,
          400,
        );
      }

      const user = await User.findById(resetToken.userId);
      if (!user) {
        return c.json(
          apiError("user_not_found", "User not found") satisfies ErrorResponse,
          404,
        );
      }

      const passwordHash = await Bun.password.hash(password, {
        algorithm: "bcrypt",
        cost: 10,
      });

      user.passwordHash = passwordHash;
      user.passwordUpdatedAt = new Date();
      await user.save();

      resetToken.usedAt = new Date();
      await resetToken.save();
      await PasswordResetToken.findByIdAndDelete(resetToken._id);

      return c.json(
        apiSuccess({ message: "Password reset successfully" }) satisfies ApplyPasswordResetResponse,
      );
    },
  );

export default app;
export type AppType = typeof app;
