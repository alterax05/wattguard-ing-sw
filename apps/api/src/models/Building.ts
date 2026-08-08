import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from "mongoose";

const pointSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
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
      min: [0, "Surface must be positive"],
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
      enum: ["active", "inactive", "decommissioned"],
      default: "active",
      index: true,
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

// Compound indexes for search queries
buildingSchema.index({ name: "text", address: "text" });
buildingSchema.index({ geographicZone: 1, buildingType: 1 });
buildingSchema.index({ status: 1, buildingType: 1 });

export const Building = mongoose.model("Building", buildingSchema);

export type BuildingDocument = HydratedDocument<InferSchemaType<typeof buildingSchema>>;

export type BuildingStatus = BuildingDocument["status"];
