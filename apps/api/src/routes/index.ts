import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { logger } from "hono/logger";
import { languageDetector } from "hono/language";
import { openAPIRouteHandler } from "hono-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { openapiConfig } from "../config/openapi";

import health from "./health";
import invites from "./invites";
import auth from "./auth";
import authLocal from "./auth-local";
import authGoogle from "./auth-google";
import users from "./users";
import buildingTypes from "./building-types";
import buildings from "./buildings";
import sensors from "./sensors";
import alerts from "./alerts";
import metrics from "./metrics";
import settings from "./settings";
import readings from "./readings";
import reports from "./reports";
import backups from "./backups";

// Import JWT utilities and middleware
import { loadUserDoc, requireRole } from "../middleware/auth";
import { JWT_SECRET } from "../config/variables";

// Import default language
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@wattguard/shared";

const requireAuth = [
  jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
  loadUserDoc(),
] as const;

const requireOperator = [
  ...requireAuth,
  requireRole("admin", "operator"),
] as const;

const requireAdmin = [
  ...requireAuth,
  requireRole("admin"),
] as const;

const app = new Hono()
  .use(
    languageDetector({
      supportedLanguages: [...SUPPORTED_LOCALES],
      fallbackLanguage: DEFAULT_LOCALE,
    }),
  )
  .use("/users/*", ...requireAdmin)
  .use("/auth/me", ...requireAuth)
  .use("/auth/me/language", ...requireAuth)
  .use("/auth/admin/*", ...requireAdmin)
  .use("/building-types/*", ...requireOperator)
  .use("/buildings/*", ...requireOperator)
  .use("/sensors/*", ...requireOperator)
  .use("/alerts/*", ...requireOperator)
  .use("/metrics/*", ...requireOperator)
  .use("/settings/*", ...requireOperator)
  .use("/readings/*", ...requireAdmin)
  .use("/reports/*", ...requireAdmin)
  .use("/backups/*", ...requireAdmin)
  .use(logger())
  .route("/invites", invites)
  .route("/health", health)
  .route("/auth", auth)
  .route("/auth/local", authLocal)
  .route("/auth/google", authGoogle)
  .route("/users", users)
  .route("/building-types", buildingTypes)
  .route("/buildings", buildings)
  .route("/sensors", sensors)
  .route("/alerts", alerts)
  .route("/metrics", metrics)
  .route("/settings", settings)
  .route("/readings", readings)
  .route("/reports", reports)
  .route("/backups", backups);

// OpenAPI
app.get(
  "/openapi.json",
  openAPIRouteHandler(app, {
    documentation: openapiConfig,
  }),
)
.get(
  "/docs",
  Scalar({
    theme: "default",
    url: "/api/v1/openapi.json",
  }),
);

export default app;
export type AppType = typeof app;

