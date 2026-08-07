import mongoose, { Schema, type InferSchemaType } from "mongoose";

const buildingTypeSchema = new Schema(
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

export const BuildingType = mongoose.model(
  "BuildingType",
  buildingTypeSchema
);

export type BuildingTypeDocument = InferSchemaType<typeof buildingTypeSchema>;
