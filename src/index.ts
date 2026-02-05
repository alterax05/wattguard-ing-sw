import { serve } from "bun";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { jwt } from "hono/jwt";
import { describeRoute, openAPIRouteHandler } from "hono-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import mongoose from "mongoose";

// Import routes
import invites from "./routes/invites";
import auth from "./routes/auth";
import authLocal from "./routes/auth-local";
import authGoogle from "./routes/auth-google";
import admin from "./routes/admin";
import buildingTypes from "./routes/building-types";
import buildings from "./routes/buildings";
import sensors from "./routes/sensors";

// Import JWT utilities and middleware
import { getJWTSecret } from "./auth/jwt";
import { loadUserDoc, requireRole } from "./middleware/auth";

// Import MQTT client
import { connectAndSubscribe } from "./lib/mqtt";

// Import OpenAPI configuration
import { openapiConfig } from "./config/openapi";

// MongoDB connection (skip in test mode)
if (process.env.NODE_ENV !== "test") {
  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/wattguard";

  mongoose
    .connect(MONGO_URI)
    .then(() => {
      console.log("✅ Connected to MongoDB");
      // Start MQTT client after DB connection
      connectAndSubscribe();
    })
    .catch((err) => console.error("❌ MongoDB connection error:", err));
}

const app = new Hono()
  .use(
    "/api/admin/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token" }),
    loadUserDoc(),
    requireRole("admin"),
  )
  .use(
    "/api/auth/me",
    jwt({ secret: getJWTSecret(), cookie: "access_token" }),
    loadUserDoc(),
  )
  .use(
    "/api/auth/admin/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token" }),
    loadUserDoc(),
    requireRole("admin"),
  )
  .use(
    "/api/building-types/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/api/buildings/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/api/sensors/*",
    jwt({ secret: getJWTSecret(), cookie: "access_token" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )

  .get(
    "/api/health",
    describeRoute({
      tags: ["Health"],
      responses: {
        200: {
          description: "Server is running correctly",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string" },
                },
                required: ["status"],
              },
            },
          },
        },
      },
    }),
    (c) => c.json({ status: "ok" }),
  )
  .route("/api/invites", invites)
  .route("/api/auth", auth)
  .route("/api/auth/local", authLocal)
  .route("/api/auth/google", authGoogle)
  .route("/api/admin", admin)
  .route("/api/building-types", buildingTypes)
  .route("/api/buildings", buildings)
  .route("/api/sensors", sensors);

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
  );

if (process.env.NODE_ENV !== "test") {
  app.use("*", logger());
}

app.use(
  "*",
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);

// Export app and type for RPC client
export { app };
export type AppType = typeof app;

// Start server only if not in test mode
if (process.env.NODE_ENV !== "test") {
  const server = serve({
    fetch: app.fetch,
    port: 3000,
    development: process.env.NODE_ENV !== "production" && {
      hmr: true,
      console: true,
    },
  });

  console.log(`🚀 Server running at ${server.url}`);
  console.log(`📚 API Documentation: ${server.url}api/docs`);
}
