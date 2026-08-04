import mongoose, { Schema, Types } from "mongoose";

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "active" | "acknowledged" | "resolved";
export type AlertThresholdType = "min" | "max";

export interface IAlert {
  buildingId: Types.ObjectId;
  buildingName: string;
  sensorId?: Types.ObjectId;
  type: string;
  thresholdType?: AlertThresholdType;
  severity: AlertSeverity;
  message: string;
  status: AlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const alertSchema = new Schema<IAlert>(
  {
    buildingId: {
      type: Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    buildingName: {
      type: String,
      required: true,
    },
    sensorId: {
      type: Schema.Types.ObjectId,
      ref: "Sensor",
      required: false,
      index: true,
    },
    type: {
      type: String,
      required: true,
    },
    thresholdType: {
      type: String,
      enum: ["min", "max"],
      required: false,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "acknowledged", "resolved"],
      default: "active",
      index: true,
    },
    acknowledgedBy: {
      type: String,
      required: false,
    },
    acknowledgedAt: {
      type: Date,
      required: false,
    },
    resolvedBy: {
      type: String,
      required: false,
    },
    resolvedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to find alerts for a specific building easily
alertSchema.index({ buildingId: 1, status: 1 });
// Compound index to prevent creating duplicate active alerts for the same sensor/type
alertSchema.index({ sensorId: 1, type: 1, status: 1 });

export const Alert = mongoose.model<IAlert>("Alert", alertSchema);
