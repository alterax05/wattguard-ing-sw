import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import type { AuthVariables } from "../middleware/auth";
import { requireRole } from "../middleware/auth";
import { SystemConfig } from "../models/SystemConfig";
import { Building } from "../models/Building";
import { Sensor } from "../models/Sensor";
import { Alert } from "../models/Alert";
import { User } from "../models/User";
import { serializeConfig } from "../lib/settings";
import { ErrorSchema } from "@wattguard/shared";

const app = new Hono<{ Variables: AuthVariables }>()
  .post(
    "/",
    requireRole("admin"),
    describeRoute({
      description:
        "Generate and download a full database backup as a JSON file (admin only)",
      tags: ["Backups"],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: "JSON backup file download",
          content: { "application/json": { schema: { type: "object" } } },
        },
        401: {
          description: "Unauthorized",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
        403: {
          description: "Forbidden – requires admin role",
          content: { "application/json": { schema: resolver(ErrorSchema) } },
        },
      },
    }),
    async (c) => {
      // Fetch all collections in parallel (exclude password hashes from users)
      const [buildings, sensors, alerts, users, config] = await Promise.all([
        Building.find().lean(),
        Sensor.find().lean(),
        Alert.find().lean(),
        User.find().select("-passwordHash -googleSub").lean(),
        SystemConfig.getOrCreate(),
      ]);

      const backup = {
        backupAt: new Date().toISOString(),
        version: "1.0",
        collections: {
          buildings,
          sensors,
          alerts,
          users,
          systemConfig: serializeConfig(config),
        },
      };

      const filename = `wattguard-backup-${new Date().toISOString().slice(0, 10)}.json`;

      c.header("Content-Type", "application/json");
      c.header("Content-Disposition", `attachment; filename="${filename}"`);

      return c.body(JSON.stringify(backup, null, 2));
    }
  );

export default app;
export type AppType = typeof app;
