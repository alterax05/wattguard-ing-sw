import { serve } from "bun";
import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { openAPIRouteHandler } from "hono-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import mongoose from "mongoose";
import path from "path";

// Import routes
import health from "./routes/health";
import invites from "./routes/invites";
import auth from "./routes/auth";
import authLocal from "./routes/auth-local";
import authGoogle from "./routes/auth-google";
import admin from "./routes/admin";
import buildingTypes from "./routes/building-types";
import buildings from "./routes/buildings";
import sensors from "./routes/sensors";
import alerts from "./routes/alerts";
import dashboard from "./routes/dashboard";
import settings from "./routes/settings";
import exportRoute from "./routes/export";

// Import JWT utilities and middleware
import { getJWTSecret } from "./auth/jwt";
import { loadUserDoc, requireRole } from "./middleware/auth";

// Import MQTT client
import { connectAndSubscribe } from "./lib/mqtt";

// Import OpenAPI configuration
import { openapiConfig } from "./config/openapi";

const app = new Hono()
  .use(
    "/api/admin/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin"),
  )
  .use(
    "/api/auth/me",
    jwt({ secret: getJWTSecret(), cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
  )
  .use(
    "/api/auth/admin/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin"),
  )
  .use(
    "/api/building-types/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/api/buildings/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/api/sensors/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/api/alerts/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/api/dashboard/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/api/settings/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin"),
  )
  .use(
    "/api/export/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin"),
  )
  .route("/api/invites", invites)
  .route("/api/health", health)
  .route("/api/auth", auth)
  .route("/api/auth/local", authLocal)
  .route("/api/auth/google", authGoogle)
  .route("/api/admin", admin)
  .route("/api/building-types", buildingTypes)
  .route("/api/buildings", buildings)
  .route("/api/sensors", sensors)
  .route("/api/alerts", alerts)
  .route("/api/dashboard", dashboard)
  .route("/api/settings", settings)
  .route("/api/export", exportRoute);

// OpenAPI documentation routes and logger middleware
app
  .get(
    "/api/openapi.json",
    openAPIRouteHandler(app, {
      documentation: openapiConfig,
    }),
  )
  .get(
    "/api/docs",
    Scalar({
      theme: "default",
      url: "/api/openapi.json",
    }),
  )
  .use(logger());

if (process.env.NODE_ENV === "production") {
  const staticRoot = path.resolve(process.cwd(), "dist");

  app.use("*", serveStatic({ root: staticRoot }));

  app.get("*", (c, next) => {
    if (c.req.path === "/api" || c.req.path.startsWith("/api/")) {
      return next();
    }

    const accept = c.req.header("Accept");
    if (accept && !accept.includes("text/html")) {
      return next();
    }

    return serveStatic({
      root: staticRoot,
      path: "index.html",
    })(c, next);
  });
}

// Export app and type for RPC client
export { app };
export type AppType = typeof app;

async function startServer() {
  const MONGO_URI = process.env.MONGO_URI;
  const MQTT_ENABLED = process.env.MQTT_ENABLED === "true";

  if (!MONGO_URI) {
    throw new Error("MONGO_URI environment variable is not set");
  }

  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // Start MQTT client after DB connection.
  if (MQTT_ENABLED) connectAndSubscribe();

  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }

  const server = serve({
    fetch: app.fetch,
    hostname: "0.0.0.0",
    port,
    development: process.env.NODE_ENV !== "production" && {
      hmr: true,
      console: true,
    },
  });

  console.log(`🚀 Server running at ${server.url}`);
  console.log(`📚 API Documentation: ${server.url}api/docs`);
}

// Tests import the Hono app without opening a network server or database connection.
if (process.env.NODE_ENV !== "test") {
  startServer().catch((error) => {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  });
}
