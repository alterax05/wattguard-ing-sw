import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * SensorReading - Time-Series Collection for MongoDB
 */

const metadataSchema = new Schema(
  {
    sensorId: {
      type: Schema.Types.ObjectId,
      ref: "Sensor",
      required: true,
    },
    buildingId: {
      type: Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    sensorType: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

const sensorReadingSchema = new Schema(
  {
    timestamp: {
      type: Date,
      required: true,
    },
    value: {
      type: Number,
      required: true,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
    metadata: {
      type: metadataSchema,
      required: true,
    },
  },
  {
    // Time-series collection configuration with native TTL
    timeseries: {
      timeField: "timestamp",
      metaField: "metadata",
      granularity: "minutes", // Data every ~90 seconds
    },
    expireAfterSeconds: 365 * 24 * 60 * 60, // 365 days default retention
  }
);

export type SensorReadingDocument = InferSchemaType<typeof sensorReadingSchema>;

export const SensorReading = mongoose.model(
  "SensorReading",
  sensorReadingSchema,
  "sensorreadings"
);
