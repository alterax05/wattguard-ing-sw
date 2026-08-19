/**
 * Google OAuth routes
 *
 * Two flows share a single /callback:
 *   1. Invite flow  – GET /start?inviteToken=...  (new user accepting an invite)
 *   2. Login flow   – GET /login                  (existing user signing in)
 *
 * The `oauth_mode` cookie ("invite" | "login") tells the callback which path
 * to follow.
 */
import { Hono, type Context } from "hono";
import { setCookie, getCookie } from "hono/cookie";
import { User } from "../models/User";
import { Invite } from "../models/Invite";
import { hashTokenSha256, randomToken } from "../utils/crypto";
import { signAccessToken } from "../auth/jwt";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  IS_PRODUCTION,
  PUBLIC_APP_URL,
} from "../config/variables";

const APP_URL = PUBLIC_APP_URL;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Short-lived cookie options (5 min). */
const tempCookieOptions = () =>
  ({
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "Lax" as const,
    maxAge: 5 * 60,
    path: "/",
  }) as const;

/** Build the Google OAuth authorization URL. */
function buildGoogleAuthUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  return url.toString();
}

/** Exchange the authorisation code for Google tokens + userinfo. */
async function exchangeCodeForUser(code: string) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    console.error("Token exchange failed:", text);
    return null;
  }

  const tokens = (await tokenResponse.json()) as { access_token: string };

  const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoResponse.ok) {
    console.error("UserInfo fetch failed:", await userInfoResponse.text());
    return null;
  }

  const info = (await userInfoResponse.json()) as {
    id: string;
    email: string;
    name?: string;
    verified_email: boolean;
  };

  return info;
}

/** Set the JWT access_token cookie and clear temp OAuth cookies. */
async function finaliseLogin(
  c: Context,
  userId: string,
  email: string,
  role: "admin" | "operator",
): Promise<void> {
  const token = await signAccessToken({ userId, email, role });

  setCookie(c, "access_token", token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "Lax",
    maxAge: 8 * 60 * 60,
    path: "/",
  });

  // Clear temporary cookies
  setCookie(c, "invite_token", "", { maxAge: 0, path: "/" });
  setCookie(c, "oauth_state", "", { maxAge: 0, path: "/" });
  setCookie(c, "oauth_mode", "", { maxAge: 0, path: "/" });
}

/* ── Routes ───────────────────────────────────────────────────────────────── */

/**
 * GET /api/auth/google/start    - Start invite-based Google OAuth flow
 * GET /api/auth/google/login    - Start Google OAuth login for existing users
 * GET /api/auth/google/callback - Shared callback for both flows
 */
const app = new Hono()
  /* ── Invite flow (existing) ─────────────────────────────────────────── */
  .get("/start", async (c) => {
    const inviteToken = c.req.query("inviteToken");

    if (!inviteToken) {
      return c.json({ error: "inviteToken is required", code: "invite_token_required" }, 400);
    }

    const tokenHash = hashTokenSha256(inviteToken);
    const invite = await Invite.findOne({ tokenHash, status: "pending" });

    if (!invite) {
      return c.json({ error: "Invalid or already used invite", code: "invite_invalid_or_used" }, 400);
    }

    if (invite.expiresAt < new Date()) {
      invite.status = "expired";
      await invite.save();
      return c.json({ error: "Invite has expired", code: "invite_expired" }, 400);
    }

    const state = randomToken(32);
    const opts = tempCookieOptions();

    setCookie(c, "invite_token", inviteToken, opts);
    setCookie(c, "oauth_state", state, opts);
    setCookie(c, "oauth_mode", "invite", opts);

    return c.redirect(buildGoogleAuthUrl(state));
  })

  /* ── Login flow (new) ───────────────────────────────────────────────── */
  .get("/login", async (c) => {
    const state = randomToken(32);
    const opts = tempCookieOptions();

    setCookie(c, "oauth_state", state, opts);
    setCookie(c, "oauth_mode", "login", opts);

    return c.redirect(buildGoogleAuthUrl(state));
  })

  /* ── Shared callback ────────────────────────────────────────────────── */
  .get("/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!code || !state) {
      return c.redirect(`${APP_URL}/login?error=missing_params`);
    }

    // Verify state
    const savedState = getCookie(c, "oauth_state");
    if (!savedState || savedState !== state) {
      return c.redirect(`${APP_URL}/login?error=invalid_state`);
    }

    const mode = getCookie(c, "oauth_mode") || "invite";

    try {
      // Exchange code for Google user info
      const userInfo = await exchangeCodeForUser(code);
      if (!userInfo) {
        return c.redirect(`${APP_URL}/login?error=token_exchange_failed`);
      }

      if (!userInfo.verified_email) {
        return c.redirect(`${APP_URL}/login?error=email_not_verified`);
      }

      const googleEmail = userInfo.email.toLowerCase().trim();
      const googleSub = userInfo.id;
      const googleName = userInfo.name || undefined;

      /* ── LOGIN mode: existing user only ────────────────────────────── */
      if (mode === "login") {
        // Look up user by email
        const user = await User.findOne({ email: googleEmail });

        if (!user) {
          return c.redirect(`${APP_URL}/login?error=no_account`);
        }

        if (user.isDisabled) {
          return c.redirect(`${APP_URL}/login?error=account_disabled`);
        }

        // Auto-link Google sub if first Google login for this user
        if (!user.googleSub) {
          user.googleSub = googleSub;
          if (!user.name && googleName) {
            user.name = googleName;
          }
        } else if (user.googleSub !== googleSub) {
          return c.redirect(`${APP_URL}/login?error=account_mismatch`);
        }

        user.lastLoginAt = new Date();
        await user.save();

        await finaliseLogin(c, user._id.toString(), user.email, user.role);
        return c.redirect(`${APP_URL}/dashboard`);
      }

      /* ── INVITE mode: accept invite (original flow) ────────────────── */
      const inviteToken = getCookie(c, "invite_token");
      if (!inviteToken) {
        return c.redirect(`${APP_URL}/login?error=missing_invite`);
      }

      const tokenHash = hashTokenSha256(inviteToken);
      const invite = await Invite.findOne({ tokenHash, status: "pending" });

      if (!invite || invite.expiresAt < new Date()) {
        return c.redirect(`${APP_URL}/login?error=invalid_invite`);
      }

      if (invite.email !== googleEmail) {
        return c.redirect(`${APP_URL}/login?error=email_mismatch`);
      }

      let user = await User.findOne({ email: googleEmail });

      if (user) {
        if (!user.googleSub) {
          user.googleSub = googleSub;
          if (!user.name && googleName) {
            user.name = googleName;
          }
          await user.save();
        } else if (user.googleSub !== googleSub) {
          return c.redirect(`${APP_URL}/login?error=account_mismatch`);
        }
      } else {
        user = await User.create({
          email: googleEmail,
          name: googleName,
          role: invite.role,
          isDisabled: false,
          googleSub,
        });
      }

      invite.status = "accepted";
      invite.acceptedAt = new Date();
      await invite.save();

      user.lastLoginAt = new Date();
      await user.save();

      await finaliseLogin(c, user._id.toString(), user.email, user.role);
      return c.redirect(APP_URL);
    } catch (err) {
      console.error("OAuth callback error:", err);
      return c.redirect(`${APP_URL}/login?error=server_error`);
    }
  });

export default app;
export type AppType = typeof app;
