import mqtt from "mqtt";
import { z } from "zod";
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
const MqttReadingPayloadSchema = LastReadingSchema.omit({
  timestamp: true,
  unit: true,
}).extend({
  timestamp: z.iso.datetime().optional(),
  unit: z.string().min(1),
});

const READING_TOPIC_PATTERN = /^sensors\/([^/]+)\/readings$/;

/** Ingest a reading published on `sensors/{sensorId}/readings`. */
async function handleMqttMessage(topic: string, message: Buffer): Promise<void> {
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
}

export async function connectAndSubscribe() {
  const client = await mqtt.connectAsync(MQTT_BROKER_URL);

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

  client.on("message", (topic, message) => {
    void handleMqttMessage(topic, message);
  });

  client.on("error", (err) => {
    console.error("❌ MQTT Client Error:", err);
  });

  return client;
}
