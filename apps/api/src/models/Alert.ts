import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";
import {
  AlertSeveritySchema,
  AlertStatusSchema,
  AlertThresholdTypeSchema,
} from "@wattguard/shared";


const alertSchema = new Schema(
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
      enum: AlertThresholdTypeSchema.options,
      required: false,
    },
    severity: {
      type: String,
      enum: AlertSeveritySchema.options,
      required: true,
    },
    sensorType: {
      type: String,
      required: false,
    },
    location: {
      type: String,
      required: false,
    },
    value: {
      type: Number,
      required: false,
    },
    unit: {
      type: String,
      required: false,
    },
    limit: {
      type: Number,
      required: false,
    },
    status: {
      type: String,
      enum: AlertStatusSchema.options,
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
    toObject: {
      virtuals: true,
      flattenObjectIds: true,
    },
  }
);

// Compound index to find alerts for a specific building easily
alertSchema.index({ buildingId: 1, status: 1 });
// Compound index to prevent creating duplicate active alerts for the same sensor/type
alertSchema.index({ sensorId: 1, type: 1, status: 1 });

export type AlertDocument = InferSchemaType<typeof alertSchema>;

export type HydratedAlert = HydratedDocument<AlertDocument>;

export const Alert = mongoose.model("Alert", alertSchema);
