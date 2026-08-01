import mongoose, { Schema } from "mongoose";

export interface IBuildingType {
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const buildingTypeSchema = new Schema<IBuildingType>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: false,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const BuildingType = mongoose.model<IBuildingType>(
  "BuildingType",
  buildingTypeSchema
);
