import mongoose, { Schema, Types } from "mongoose";

export type SensorType = "internal_temp" | "external_temp" | "energy_meter";
export type SensorStatus = "active" | "inactive" | "maintenance" | "error";

export interface ILastReading {
  value: number;
  timestamp: Date;
  unit: string;
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
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false } // Don't create _id for subdocument
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
      enum: ["internal_temp", "external_temp", "energy_meter"],
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
      required: false,
      unique: true,
      sparse: true, // allows multiple null values
      trim: true,
    },
    installationDate: {
      type: Date,
      required: true,
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
      default: 90,
      min: [10, "Transmission interval must be at least 10 seconds"],
      max: [3600, "Transmission interval cannot exceed 1 hour"],
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

sensorSchema.index({ buildingId: 1, status: 1 });
sensorSchema.index({ buildingId: 1, sensorType: 1 });

export const Sensor = mongoose.model<ISensor>("Sensor", sensorSchema);
