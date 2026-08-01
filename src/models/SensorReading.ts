import mongoose, { Schema, Types } from "mongoose";

/**
 * SensorReading - Time-Series Collection for MongoDB
 */

export interface ISensorReading {
  timestamp: Date;
  value: number;
  unit: string;
  metadata: {
    sensorId: Types.ObjectId;
    buildingId: Types.ObjectId;
    sensorType: string;
  };
}

const sensorReadingSchema = new Schema<ISensorReading>(
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
  },
  {
    // Time-series collection configuration
    // Mongoose will automatically create the collection with these options
    timeseries: {
      timeField: "timestamp",
      metaField: "metadata",
      granularity: "minutes", // Data every ~90 seconds fits "minutes" granularity
    },
  }
);

export const SensorReading = mongoose.model<ISensorReading>(
  "SensorReading",
  sensorReadingSchema,
  "sensorreadings"
);
