import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from "mongoose";
import { BuildingStatusSchema, type GeoJSONPoint } from "@wattguard/shared";

const pointSchema = new Schema<GeoJSONPoint>(
  {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (val: number[]) => val.length === 2,
        message: "Coordinates must be a [longitude, latitude] pair",
      },
    },
  },
  { _id: false }
);

export const buildingSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    surface: {
      type: Number,
      required: true,
      min: [1, "Surface must be positive"],
    },
    ceilingHeight: {
      type: Number,
      required: true,
      default: 3.0,
      min: [0.5, "Ceiling height must be at least 0.5m"],
      max: [20, "Ceiling height must be reasonable"],
    },
    location: {
      type: pointSchema,
      required: true,
      index: "2dsphere",
    },
    buildingType: {
      type: Schema.Types.ObjectId,
      ref: "BuildingType",
      required: true,
      index: true,
    },
    heatingSystemType: {
      type: String,
      required: true,
      trim: true,
    },
    constructionYear: {
      type: Number,
      required: false,
      min: [1000, "Invalid construction year"],
      max: [new Date().getFullYear() + 10, "Construction year cannot be too far in the future"],
    },
    geographicZone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: BuildingStatusSchema.options,
      default: "active",
      index: true,
    },
    efficiencyThresholds: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: false },
          minCop: { type: Number, min: 0, max: 10, default: null },
        },
        { _id: false },
      ),
      default: () => ({ enabled: false, minCop: null }),
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
    toObject: {
      virtuals: true,
      flattenObjectIds: true,
    },
  }
);

// Compound indexes for search queries
buildingSchema.index({ name: "text", address: "text" });
buildingSchema.index({ geographicZone: 1, buildingType: 1 });
buildingSchema.index({ status: 1, buildingType: 1 });

export const Building = mongoose.model("Building", buildingSchema);

export type BuildingDocument = HydratedDocument<InferSchemaType<typeof buildingSchema>>;
