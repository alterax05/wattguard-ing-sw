import mongoose, {
  Schema,
  type InferSchemaType,
  type HydratedDocument,
} from "mongoose";
import { Building } from "./Building";
import { User } from "./User";
import {
  SensorStatusSchema,
  SensorTypeSchema,
  type SensorStatus,
} from "@wattguard/shared";

const lastReadingSchema = new Schema(
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
  { _id: false },
);

const sensorSchema = new Schema(
  {
    building: {
      type: Schema.Types.ObjectId,
      ref: Building,
      required: true,
      index: true,
    },
    sensorType: {
      type: String,
      enum: SensorTypeSchema.options,
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
      unique: true,
      sparse: true,
    },
    installationDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      enum: SensorStatusSchema.options,
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
      ref: User,
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: User,
      required: true,
    },
  },
  {
    timestamps: true,
    toObject: {
      virtuals: true,
      flattenObjectIds: true
    },
  },
);

sensorSchema.index({ building: 1, sensorType: 1 });


sensorSchema.methods.isActive = function (this: HydratedDocument<SensorDocument>): boolean {
  if (!this.lastReading?.timestamp) return false;
  const elapsedSeconds =
    (Date.now() - this.lastReading.timestamp.getTime()) / 1000;
  return elapsedSeconds <= 2 * this.transmissionInterval;
};

sensorSchema.methods.updateStatus = async function (
  this: HydratedDocument<SensorDocument> & { isActive(): boolean },
  newStatus?: SensorStatus,
) {
  if (newStatus !== undefined) {
    this.status = newStatus;
  } else if (this.status === "active" || this.status === "inactive") {
    this.status = this.isActive() ? "active" : "inactive";
  }
  await this.save();
};

export type SensorDocument = InferSchemaType<typeof sensorSchema>;

interface ISensorMethods {
  isActive(): boolean;
  updateStatus(newStatus?: SensorStatus): Promise<void>
}

export type HydratedSensor = HydratedDocument<SensorDocument, ISensorMethods>;

type SensorModel = mongoose.Model<
  SensorDocument,
  object,
  ISensorMethods,
  object
>;

export const Sensor = mongoose.model<SensorDocument, SensorModel>(
  "Sensor",
  sensorSchema,
);
