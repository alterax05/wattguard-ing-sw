import mongoose from "mongoose";
import mqtt from "mqtt";
import {
  MONGO_URI,
  MQTT_BROKER_URL,
  SIM_TIME_SCALE,
} from "../src/config/variables";
import { startSimulator } from "../src/services/simulator";

console.log(
  `⏩ Time scale: ×${SIM_TIME_SCALE} (1 real second = ${SIM_TIME_SCALE} simulated seconds)`,
);
console.log("🚀 Starting WattGuard Simulator (standalone MQTT publisher)");

try {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  console.log("✅ Connected to MongoDB");
} catch (err) {
  console.error("❌ MongoDB Connection Error:", err);
  process.exit(1);
}

const mqttClient = mqtt.connect(MQTT_BROKER_URL);

mqttClient.on("error", (err) => {
  console.error("❌ MQTT Error:", err);
});

await new Promise<void>((resolve) => {
  mqttClient.on("connect", () => {
    console.log("✅ Connected to MQTT Broker");
    resolve();
  });
});

const handle = await startSimulator({
  autoSeed: true,
  verbose: true,
  onReading: (reading) => {
    const topic = `sensors/${reading.sensorId}/readings`;
    mqttClient.publish(
      topic,
      JSON.stringify({
        value: reading.value,
        unit: reading.unit,
        timestamp: reading.timestamp.toISOString(),
      }),
      (err) => {
        if (err) console.error(`❌ Failed to publish to ${topic}:`, err);
      },
    );
  },
});

console.log("🧪 Simulator running. Press Ctrl+C to stop.");

process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down simulator...");
  handle.stop();
  mqttClient.end();
  mongoose.disconnect().then(() => {
    process.exit(0);
  });
});
