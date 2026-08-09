import mqtt from "mqtt";
import { LastReadingSchema, ObjectIdSchema } from "@wattguard/shared";
import {
  ingestReading,
  SensorNotFoundError,
} from "../services/reading-service";
import { MQTT_BROKER_URL } from "../config/variables";

/**
 * Payload published by sensors on `sensors/{sensorId}/readings`.
 * Same shape as the denormalized lastReading, except the timestamp is
 * optional (defaults to the current date when omitted).
 */
const MqttReadingPayloadSchema = LastReadingSchema.extend({
  timestamp: LastReadingSchema.shape.timestamp.optional(),
  unit: LastReadingSchema.shape.unit.min(1),
});

const READING_TOPIC_PATTERN = /^sensors\/([^/]+)\/readings$/;

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
    // Extract sensorId from topic
    // Topic: sensors/{sensorId}/readings
    const sensorId = READING_TOPIC_PATTERN.exec(topic)?.[1];
    if (!sensorId) {
      return;
    }

    const sensorIdResult = ObjectIdSchema.safeParse(sensorId);
    if (!sensorIdResult.success) {
      console.warn(`⚠️ Invalid sensor id in topic ${topic}: ${sensorId}`);
      return;
    }

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(message.toString());
    } catch (error) {
      console.warn(`⚠️ Invalid JSON payload from ${topic}:`, error);
      return;
    }

    const payloadResult = MqttReadingPayloadSchema.safeParse(rawPayload);
    if (!payloadResult.success) {
      console.warn(`⚠️ Invalid payload from ${topic}:`, payloadResult.error);
      return;
    }

    const payload = payloadResult.data;

    try {
      await ingestReading({
        sensorId,
        value: payload.value,
        unit: payload.unit,
        timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      });
    } catch (error) {
      if (error instanceof SensorNotFoundError) {
        console.warn(`⚠️ Received reading for unknown sensor: ${sensorId}`);
        return;
      }
      console.error(`❌ Error processing MQTT message on ${topic}:`, error);
    }
  });

  client.on("error", (err) => {
    console.error("❌ MQTT Client Error:", err);
  });

  return client;
}
