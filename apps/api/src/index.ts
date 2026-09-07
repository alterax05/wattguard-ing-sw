import { serve } from "bun";
import { Hono } from "hono";
import mongoose from "mongoose";

// Import shared i18n constants and server-side i18n bootstrap
import { ensureI18nReady } from "./lib/i18n";

// Import MQTT client
import { connectAndSubscribe } from "./lib/mqtt";

// Import in-process simulator and reading ingestion
import { startSimulator } from "./services/simulator";
import { ingestReading } from "./services/reading-service";
import { evaluateEfficiencyAlerts } from "./services/efficiency-alert-service";

import routes from "./routes";
import frontend from "./routes/frontend";

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
  SIM_DISCOVERY_INTERVAL_MS,
} from "./config/variables";

const app = new Hono().route("/api/v1", routes);

if (IS_PRODUCTION) {
  app.route("/", frontend);
}

// Export app and type for RPC client
export { app };
export type AppType = typeof app;

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    process.exit(1);
  }

  await ensureI18nReady();

  if (MQTT_ENABLED) void connectAndSubscribe();

  if (SIMULATOR_ENABLED) {
    try {
      await startSimulator({
        autoSeed: IS_DEVELOPMENT,
        discoveryIntervalMs: SIM_DISCOVERY_INTERVAL_MS,
        onReading: (reading) => ingestReading(reading),
      });
      console.log("✅ In-process simulator started");
    } catch (error) {
      console.error("❌ In-process simulator failed to start:", error);
    }
  }

  if (EFFICIENCY_ALERTS_ENABLED) {
    const run = async () => {
      await evaluateEfficiencyAlerts().catch((error) => {
        console.error("❌ Efficiency alert evaluation failed:", error);
      });
    };
    void run(); // valutazione immediata al boot
    try {
      Bun.cron(`*/${EFFICIENCY_ALERT_INTERVAL_MINUTES} * * * *`, run);
    } catch (error) {
      console.error("❌ Failed to register efficiency alert cron:", error);
    }
    console.log(
      `⏰ Efficiency alert cron started (every ${EFFICIENCY_ALERT_INTERVAL_MINUTES} min)`,
    );
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
}

if (!IS_TEST) {
  startServer().catch((error) => {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  });
}
