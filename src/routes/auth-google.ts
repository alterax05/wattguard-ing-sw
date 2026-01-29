/**
 * Google OAuth routes
 */
import { Hono } from "hono";
import { setCookie, getCookie } from "hono/cookie";
import { User } from "../models/User";
import { Invite } from "../models/Invite";
import { hashTokenSha256, randomToken } from "../utils/crypto";
import { signAccessToken } from "../auth/jwt";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/**
 * GET /api/auth/google/start - Start Google OAuth flow
 * GET /api/auth/google/callback - Google OAuth callback
 */
const app = new Hono()
  .get("/start", async (c) => {
    const inviteToken = c.req.query("inviteToken");

    if (!inviteToken) {
      return c.json({ error: "inviteToken is required" }, 400);
    }

    // Validate invite exists and is pending
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

    // Generate OAuth state
    const state = randomToken(32);

    // Set short-lived cookies (5 minutes)
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax" as const,
      maxAge: 5 * 60, // 5 minutes
      path: "/",
    };

    setCookie(c, "invite_token", inviteToken, cookieOptions);
    setCookie(c, "oauth_state", state, cookieOptions);

    // Redirect to Google
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);

    return c.redirect(authUrl.toString());
  })
  .get("/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!code || !state) {
      return c.redirect(`${FRONTEND_URL}?error=missing_params`);
    }

    // Verify state
    const savedState = getCookie(c, "oauth_state");
    if (!savedState || savedState !== state) {
      return c.redirect(`${FRONTEND_URL}?error=invalid_state`);
    }

    // Get invite token
    const inviteToken = getCookie(c, "invite_token");
    if (!inviteToken) {
      return c.redirect(`${FRONTEND_URL}?error=missing_invite`);
    }

    try {
      // Exchange code for tokens
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
        console.error("Token exchange failed:", await tokenResponse.text());
        return c.redirect(`${FRONTEND_URL}?error=token_exchange_failed`);
      }

      const tokens = await tokenResponse.json();

      // Get user info
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        console.error("UserInfo fetch failed:", await userInfoResponse.text());
        return c.redirect(`${FRONTEND_URL}?error=userinfo_failed`);
      }

      const userInfo = await userInfoResponse.json();

      // Verify email is verified
      if (!userInfo.verified_email) {
        return c.redirect(`${FRONTEND_URL}?error=email_not_verified`);
      }

      const googleEmail = userInfo.email.toLowerCase().trim();
      const googleSub = userInfo.id;

      // Validate invite
      const tokenHash = hashTokenSha256(inviteToken);
      const invite = await Invite.findOne({ tokenHash, status: "pending" });

      if (!invite || invite.expiresAt < new Date()) {
        return c.redirect(`${FRONTEND_URL}?error=invalid_invite`);
      }

      // Verify email matches invite
      if (invite.email !== googleEmail) {
        return c.redirect(`${FRONTEND_URL}?error=email_mismatch`);
      }

      // Check if user exists
      let user = await User.findOne({ email: googleEmail });

      if (user) {
        // User exists: auto-link if googleSub is empty
        if (!user.googleSub) {
          user.googleSub = googleSub;
          await user.save();
        } else if (user.googleSub !== googleSub) {
          // Different Google account
          return c.redirect(`${FRONTEND_URL}?error=account_mismatch`);
        }
      } else {
        // Create new user
        user = await User.create({
          email: googleEmail,
          role: invite.role,
          isDisabled: false,
          googleSub,
        });
      }

      // Mark invite as accepted
      if (invite.status === "pending") {
        invite.status = "accepted";
        invite.acceptedAt = new Date();
        await invite.save();
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

      // Clear temporary cookies
      setCookie(c, "invite_token", "", { maxAge: 0, path: "/" });
      setCookie(c, "oauth_state", "", { maxAge: 0, path: "/" });

      // Redirect to frontend
      return c.redirect(FRONTEND_URL);
    } catch (err) {
      console.error("OAuth callback error:", err);
      return c.redirect(`${FRONTEND_URL}?error=server_error`);
    }
  });

export default app;
export type AppType = typeof app;
