import mqtt from "mqtt";
import { Sensor } from "../models/Sensor";
import { SensorReading } from "../models/SensorReading";

export function connectAndSubscribe() {
  const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
  const client = mqtt.connect(brokerUrl);

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
      if (parts.length !== 3 || parts[0] !== "sensors" || parts[2] !== "readings") {
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
      const sensor = await Sensor.findById(sensorId);
      if (!sensor) {
        console.warn(`⚠️ Received reading for unknown sensor: ${sensorId}`);
        return;
      }

      // Create the reading document
      await SensorReading.create({
        timestamp: readingTimestamp,
        value,
        unit,
        metadata: {
          sensorId: sensor._id,
          buildingId: sensor.buildingId,
          sensorType: sensor.sensorType,
        },
      });

      // Update the sensor's last reading (denormalization for UI)
      sensor.lastReading = {
        value,
        timestamp: readingTimestamp,
        unit,
      };
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
