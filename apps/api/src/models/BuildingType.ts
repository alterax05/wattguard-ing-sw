import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

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
    toObject: {
      virtuals: true,
      flattenObjectIds: true
    },
  }
);

export const BuildingType = mongoose.model(
  "BuildingType",
  buildingTypeSchema
);

export type BuildingTypeDocument = InferSchemaType<typeof buildingTypeSchema>;

export type HydratedBuildingType = HydratedDocument<BuildingTypeDocument>;