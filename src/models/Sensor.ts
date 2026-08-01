import mongoose, { Schema, Types } from "mongoose";

export type SensorType = "internal_temp" | "external_temp" | "energy_meter" | "gas_meter";
export type SensorStatus = "active" | "inactive" | "maintenance" | "error";

export interface ILastReading {
  value: number;
  timestamp: Date;
  unit: string;
}

export interface ISimulationConfig {
  baseValue?: number;
  amplitude?: number; // For sine wave
  noise?: number; // Random deviation
  min?: number;
  max?: number;
}

export interface ISensor {
  buildingId: Types.ObjectId;
  sensorType: SensorType;
  location: string;
  serialNumber?: string;
  installationDate: Date;
  status: SensorStatus;
  lastReading?: ILastReading;
  transmissionInterval: number;
  minThreshold?: number;
  maxThreshold?: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const lastReadingSchema = new Schema<ILastReading>(
  {
    value: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const sensorSchema = new Schema<ISensor>(
  {
    buildingId: {
      type: Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    sensorType: {
      type: String,
      enum: ["internal_temp", "external_temp", "energy_meter", "gas_meter"],
      required: true,
      index: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    serialNumber: {
      type: String,
      trim: true,
    },
    installationDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "maintenance", "error"],
      default: "active",
      index: true,
    },
    lastReading: {
      type: lastReadingSchema,
      required: false,
    },
    transmissionInterval: {
      type: Number,
      required: true,
      default: 90,
      min: 10,
      max: 3600,
    },
    minThreshold: {
      type: Number,
    },
    maxThreshold: {
      type: Number,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

sensorSchema.index({ buildingId: 1, sensorType: 1 });

export const Sensor = mongoose.model<ISensor>("Sensor", sensorSchema);