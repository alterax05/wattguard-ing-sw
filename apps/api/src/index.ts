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

// Import in-process simulator and reading ingestion
import { startSimulator } from "./services/simulator";
import { ingestReading } from "./services/reading-service";
import { evaluateEfficiencyAlerts } from "./services/efficiency-alert-service";

// Import OpenAPI configuration
import { openapiConfig } from "./config/openapi";

// Import environment variables
import {
  EFFICIENCY_ALERTS_ENABLED,
  EFFICIENCY_ALERT_INTERVAL_MINUTES,
  IS_DEVELOPMENT,
  IS_PRODUCTION,
  IS_TEST,
  MONGO_URI,
  MQTT_ENABLED,
  PORT,
  SIMULATOR_ENABLED,
} from "./config/variables";

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

if (IS_PRODUCTION) {
  const staticRoot = path.resolve(import.meta.dir, "../../web/dist");

  app.use("*", async (c, next) => {
    const pathname = c.req.path;
    if (pathname.startsWith("/assets/")) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    } else if (!pathname.startsWith("/api/")) {
      c.header("Cache-Control", "no-cache");
    }
    await next();
  });

  app.use("*", serveStatic({ root: staticRoot }));

  app.get("*", (c, next) => {
    const pathname = c.req.path;

    if (pathname === "/api" || pathname.startsWith("/api/")) {
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
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // Start MQTT client after DB connection.
  if (MQTT_ENABLED) connectAndSubscribe();

  // Run the simulator in-process, feeding readings straight into the reading
  // service. Both flags are independent: MQTT and SIMULATOR_ENABLED may be on
  // at the same time. Auto-seeds demo data only in development.
  if (SIMULATOR_ENABLED) {
    await startSimulator({
      autoSeed: IS_DEVELOPMENT,
      onReading: (reading) => ingestReading(reading),
    });
    console.log("🧪 In-process simulator started");
  }

  // Schedule periodic evaluation of efficiency alert thresholds (Bun.cron).
  if (EFFICIENCY_ALERTS_ENABLED) {
    const run = async () => {
      try {
        await evaluateEfficiencyAlerts();
      } catch (error) {
        console.error("❌ Efficiency alert evaluation failed:", error);
      }
    };
    await run(); // valutazione immediata al boot
    try {
      Bun.cron(`*/${EFFICIENCY_ALERT_INTERVAL_MINUTES} * * * *`, run);
    } catch (error) {
      console.error("❌ Failed to register efficiency alert cron:", error);
    }
    console.log(`⏰ Efficiency alert cron started (every ${EFFICIENCY_ALERT_INTERVAL_MINUTES} min)`);
  }

  const server = serve({
    fetch: app.fetch,
    hostname: "0.0.0.0",
    port: PORT,
    development: IS_DEVELOPMENT && {
      hmr: true,
      console: true,
    },
  });

  console.log(`🚀 Server running at ${server.url}`);
  console.log(`📚 API Documentation: ${server.url}api/docs`);
}

// Tests import the Hono app without opening a network server or database connection.
if (!IS_TEST) {
  startServer().catch((error) => {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  });
}
