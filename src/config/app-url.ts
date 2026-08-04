const LOCAL_APP_URL = "http://localhost:5173";

function normalizeAppUrl(value: string): string {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PUBLIC_APP_URL must use http or https");
  }

  return url.origin;
}

const configuredAppUrl = process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL;

if (process.env.NODE_ENV === "production" && !configuredAppUrl) {
  throw new Error(
    "PUBLIC_APP_URL environment variable must be set in production",
  );
}

export const PUBLIC_APP_URL = normalizeAppUrl(configuredAppUrl || LOCAL_APP_URL);
