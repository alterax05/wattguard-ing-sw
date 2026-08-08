import mqtt from "mqtt";
import { Sensor } from "../models/Sensor";
import { SensorReading } from "../models/SensorReading";
import { Alert } from "../models/Alert";
import type { BuildingDocument } from "../models/Building";
import { THRESHOLD_ALERT_TYPE } from "./alerts";
import { MQTT_BROKER_URL } from "../config/variables";

export function connectAndSubscribe() {
  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("✅ Connected to MQTT Broker");

    // Subscribe to all sensor readings
    // Topic format: sensors/{sensorId}/readings
    client.subscribe("sensors/+/readings", (err) => {
      if (err) {
        console.error("❌ Failed to subscribe to sensors/+/readings:", err);
      } else {
        console.log("📡 Subscribed to sensors/+/readings");
      }
    });
  });

  client.on("message", async (topic, message) => {
    try {
      // Extract sensorId from topic
      // Topic: sensors/{sensorId}/readings
      const parts = topic.split("/");
      if (
        parts.length !== 3 ||
        parts[0] !== "sensors" ||
        parts[2] !== "readings"
      ) {
        return;
      }
      const sensorId = parts[1];

      // Parse message payload
      const payload = JSON.parse(message.toString());
      const { value, unit, timestamp } = payload;

      if (value === undefined || !unit) {
        console.warn(`⚠️ Invalid payload from ${topic}:`, payload);
        return;
      }

      const readingTimestamp = timestamp ? new Date(timestamp) : new Date();

      // Find the sensor to ensure it exists and get metadata
      const sensor = await Sensor.findById(sensorId).populate<{
        buildingId: BuildingDocument;
      }>("buildingId");
      if (!sensor) {
        console.warn(`⚠️ Received reading for unknown sensor: ${sensorId}`);
        return;
      }

      const building = sensor.buildingId;
      // Check thresholds and generate alerts
      if (
        (sensor.minThreshold != null && value < sensor.minThreshold) ||
        (sensor.maxThreshold != null && value > sensor.maxThreshold)
      ) {
        const isMin =
          sensor.minThreshold != null && value < sensor.minThreshold;
        const thresholdType = isMin ? "min" : "max";
        // Check if an active alert already exists for this sensor and type
        const existingAlert = await Alert.findOne({
          sensorId: sensor._id,
          type: THRESHOLD_ALERT_TYPE,
          status: "active",
        });

        if (!existingAlert) {
          const limit = isMin ? sensor.minThreshold : sensor.maxThreshold;
          const severity = "high";
          const message = `Valore fuori soglia rilevato per il sensore ${sensor.sensorType} (${sensor.location}): ${value}${unit} (Limite: ${limit}${unit})`;

          await Alert.create({
            buildingId: building._id,
            buildingName: building.name || "Edificio Sconosciuto",
            sensorId: sensor._id,
            type: THRESHOLD_ALERT_TYPE,
            thresholdType,
            severity,
            message,
            status: "active",
          });
        }
      }

      // Create the reading document
      await SensorReading.create({
        timestamp: readingTimestamp,
        value,
        unit,
        metadata: {
          sensorId: sensor._id,
          buildingId: building._id,
          sensorType: sensor.sensorType,
        },
      });

      // Update the sensor's last reading (denormalization for UI)
      sensor.lastReading = {
        value,
        timestamp: readingTimestamp,
        unit,
      };
      // If the sensor was auto-marked inactive, a new reading means it's back online.
      if (sensor.status === "inactive") {
        sensor.status = "active";
      }
      await sensor.save();
    } catch (error) {
      console.error(`❌ Error processing MQTT message on ${topic}:`, error);
    }
  });

  client.on("error", (err) => {
    console.error("❌ MQTT Client Error:", err);
  });

  return client;
}
