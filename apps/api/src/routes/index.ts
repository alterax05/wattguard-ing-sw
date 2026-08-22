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
import admin from "./admin";
import buildingTypes from "./building-types";
import buildings from "./buildings";
import sensors from "./sensors";
import alerts from "./alerts";
import dashboard from "./dashboard";
import settings from "./settings";
import exportRoute from "./export";

// Import JWT utilities and middleware
import { loadUserDoc, requireRole } from "../middleware/auth";
import { JWT_SECRET } from "../config/variables";

// Import default language
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@wattguard/shared";

const app = new Hono()
  .use(
    languageDetector({
      supportedLanguages: [...SUPPORTED_LOCALES],
      fallbackLanguage: DEFAULT_LOCALE,
    }),
  )
  .use(
    "/admin/*",
    jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin"),
  )
  .use(
    "/auth/me",
    jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
  )
  .use(
    "/auth/admin/*",
    jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin"),
  )
  .use(
    "/building-types/*",
    jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/buildings/*",
    jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/sensors/*",
    jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/alerts/*",
    jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/dashboard/*",
    jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin", "operator"),
  )
  .use(
    "/settings/*",
    jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin"),
  )
  .use(
    "/export/*",
    jwt({ secret: JWT_SECRET, cookie: "access_token", alg: "HS256" }),
    loadUserDoc(),
    requireRole("admin"),
  )
  .use(logger())
  .route("/invites", invites)
  .route("/health", health)
  .route("/auth", auth)
  .route("/auth/local", authLocal)
  .route("/auth/google", authGoogle)
  .route("/admin", admin)
  .route("/building-types", buildingTypes)
  .route("/buildings", buildings)
  .route("/sensors", sensors)
  .route("/alerts", alerts)
  .route("/dashboard", dashboard)
  .route("/settings", settings)
  .route("/export", exportRoute);

  //OpenAPI
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
