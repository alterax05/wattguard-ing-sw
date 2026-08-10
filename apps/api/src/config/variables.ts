/**
 * Centralized environment variable access.
 *
 * All `process.env` reads, parsing, defaults, and validation live here.
 */

const LOCAL_APP_URL = "http://localhost:5173";
const DEV_JWT_SECRET = "dev-secret-change-in-production";

// ── Runtime environment ──────────────────────────────────────────────────────

export const NODE_ENV = process.env.NODE_ENV ?? "development";

export const IS_PRODUCTION = NODE_ENV === "production";
export const IS_DEVELOPMENT = NODE_ENV !== "production";
export const IS_TEST = NODE_ENV === "test";

export const debugPrint = (message: string, ...args: unknown[]) => {
  if (IS_DEVELOPMENT) {
    console.log(message, ...args);
  }
}

// ── MongoDB ──────────────────────────────────────────────────────────────────

export const MONGO_URI = ((): string => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI environment variable is not set");
  }
  return uri;
})();

export const MONGO_URI_TEST = ((): string | undefined => {
  const uri = process.env.MONGO_URI_TEST;
  if (IS_TEST && !uri) {
    throw new Error("MONGO_URI_TEST environment variable is not set");
  }
  return uri;
})();

// ── MQTT ─────────────────────────────────────────────────────────────────────

export const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

export const MQTT_ENABLED = process.env.MQTT_ENABLED === "true";

// ── Server ───────────────────────────────────────────────────────────────────

export const PORT = ((): number => {
  const raw = process.env.PORT;
  const port = Number(raw ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${raw}`);
  }
  return port;
})();

// ── JWT ──────────────────────────────────────────────────────────────────────

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret && IS_PRODUCTION) {
  throw new Error("JWT_SECRET environment variable must be set in production");
}

// Use a dev secret only in development/test with warning
export const JWT_SECRET: string = jwtSecret || (() => {
  console.warn("⚠️  WARNING: Using default JWT_SECRET. Set JWT_SECRET in production!");
  return DEV_JWT_SECRET;
})();

// ── Public app URL ───────────────────────────────────────────────────────────

function normalizeAppUrl(value: string): string {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PUBLIC_APP_URL must use http or https");
  }

  return url.origin;
}

const configuredAppUrl = process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL;

if (IS_PRODUCTION && !configuredAppUrl) {
  throw new Error(
    "PUBLIC_APP_URL environment variable must be set in production",
  );
}

export const PUBLIC_APP_URL = normalizeAppUrl(configuredAppUrl || LOCAL_APP_URL);

// ── Google OAuth ─────────────────────────────────────────────────────────────

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  (IS_PRODUCTION
    ? `${PUBLIC_APP_URL}/api/auth/google/callback`
    : "http://localhost:3000/api/auth/google/callback");

// ── Email (Resend) ───────────────────────────────────────────────────────────

export const EMAIL_FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";
export const RESEND_API = (() => {
  if (!process.env.RESEND_API) {
    throw new Error("RESEND_API environment variable is not set");
  }
  return process.env.RESEND_API;
})();

// ── Admin bootstrap script ───────────────────────────────────────────────────

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@wattguard.local";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// ── Simulator ────────────────────────────────────────────────────────────────

export const SIMULATOR_ENABLED = process.env.SIMULATOR_ENABLED === "true";

export const SIM_TIME_SCALE = Number(process.env.SIM_TIME_SCALE ?? 2);