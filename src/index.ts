import { serve } from "bun";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { jwt } from "hono/jwt";
import mongoose from "mongoose";

// Import routes
import invites from "./routes/invites";
import auth from "./routes/auth";
import authLocal from "./routes/auth-local";
import authGoogle from "./routes/auth-google";
import admin from "./routes/admin";

// Import JWT utilities and middleware
import { getJWTSecret } from "./auth/jwt";
import { loadUserDoc, requireRole } from "./middleware/auth";

// MongoDB connection (skip in test mode)
if (process.env.NODE_ENV !== "test") {
  const MONGO_URI = process.env.MONGO_URI!;
  
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));
}

// Create Hono app with method chaining for proper RPC type inference
const app = new Hono();

// Middleware
if (process.env.NODE_ENV !== "test") {
  app.use("*", logger());
}
app.use(
  "*",
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

// Apply JWT authentication globally to protected routes
// This checks Authorization header first, then falls back to access_token cookie
app.use(
  "/api/admin/*",
  jwt({ secret: getJWTSecret(), cookie: "access_token" }),
  loadUserDoc(),
  requireRole("admin")
);

app.use(
  "/api/auth/me",
  jwt({ secret: getJWTSecret(), cookie: "access_token" }),
  loadUserDoc()
);

app.use(
  "/api/auth/admin/*",
  jwt({ secret: getJWTSecret(), cookie: "access_token" }),
  loadUserDoc(),
  requireRole("admin")
);

// Mount routes with method chaining and export type for RPC
const routes = app
  .get("/api/health", (c) => c.json({ status: "ok" }))
  .route("/api/invites", invites)
  .route("/api/auth", auth)
  .route("/api/auth/local", authLocal)
  .route("/api/auth/google", authGoogle)
  .route("/api/admin", admin);

// Export app and type for RPC client
export { app };
export type AppType = typeof routes;

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
}
