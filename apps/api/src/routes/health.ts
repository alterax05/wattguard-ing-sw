/**
 * Health check routes
 */
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { HealthResponseSchema, type HealthResponse } from "@wattguard/shared";

/**
 * GET /api/health - Server health check
 */
const app = new Hono().get(
  "/",
  describeRoute({
    summary: "Check server status",
    description: "Checks that the server is running (public)",
    tags: ["Health"],
    responses: {
      200: {
        description: "Server is running correctly",
        content: {
          "application/json": {
            schema: resolver(HealthResponseSchema),
          },
        },
      },
    },
  }),
  (c) => c.json({ success: true as const, data: { status: "ok" } } satisfies HealthResponse),
);

export default app;
export type AppType = typeof app;
