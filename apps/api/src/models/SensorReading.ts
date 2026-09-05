import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * SensorReading - Time-Series Collection for MongoDB
 */

const metadataSchema = new Schema(
  {
    sensor: {
      type: Schema.Types.ObjectId,
      ref: "Sensor",
      required: true,
    },
    building: {
      type: Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    sensorType: {
      type: String,
      enum: ["internal_temp", "external_temp", "energy_meter", "gas_meter"],
      required: true,
    } as const,
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
    timeseries: {
      timeField: "timestamp",
      metaField: "metadata",
      granularity: "minutes",
    },
    expireAfterSeconds: 365 * 24 * 60 * 60, // 365 days default retention
    toObject: {
      flattenObjectIds: true,
    },
  }
);

export type SensorReadingDocument = InferSchemaType<typeof sensorReadingSchema>;

export const SensorReading = mongoose.model(
  "SensorReading",
  sensorReadingSchema,
  "sensorreadings"
);
