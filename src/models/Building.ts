import mongoose, { Schema, Document, Types, type PopulatedDoc } from "mongoose";
import type { IBuildingType } from "./BuildingType";

export type BuildingStatus = "active" | "inactive" | "decommissioned";

export interface IBuilding {
  name: string;
  address: string;
  surface: number; // m²
  buildingType: PopulatedDoc<IBuildingType & Document>;
  heatingSystemType: string;
  constructionYear?: number;
  geographicZone: string;
  status: BuildingStatus;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const buildingSchema = new Schema<IBuilding>(
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

export const Building = mongoose.model<IBuilding>("Building", buildingSchema);