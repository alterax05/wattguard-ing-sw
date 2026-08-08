/**
 * Health check routes
 */
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { HealthResponseSchema, type HealthResponse } from "../schemas/common";

/**
 * GET /api/health - Server health check
 */
const app = new Hono().get(
  "/",
  describeRoute({
    description: "Check if the server is running",
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
  (c) => c.json({ status: "ok" } satisfies HealthResponse),
);

export default app;
export type AppType = typeof app;
