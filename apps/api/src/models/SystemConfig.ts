import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * SystemConfig - Singleton document storing system-wide configuration.
 * Only one document ever exists; use getOrCreate() to access it.
 */

const systemConfigSchema = new Schema(
  {
    polling: {
      intervalSeconds: { type: Number, default: 90, min: 10, max: 3600 },
      autoPollingEnabled: { type: Boolean, default: true },
    },
    notifications: {
      emailEnabled: { type: Boolean, default: true },
    },
    database: {
      dataRetentionDays: { type: Number, default: 365, min: 1 },
    },
  },
  { timestamps: true },
);

type SystemConfigDocument = InferSchemaType<typeof systemConfigSchema>;
/**
 * Returns the single SystemConfig document, creating it with defaults if it
 * does not yet exist.
 */
systemConfigSchema.statics.getOrCreate =
  async function (): Promise<SystemConfigDocument> {
    const doc = await this.findOneAndUpdate(
      {},
      { $setOnInsert: {} },
      { upsert: true, setDefaultsOnInsert: true, returnDocument: "after" },
    );
    return doc;
  };

interface SystemConfigModel extends mongoose.Model<SystemConfigDocument> {
  getOrCreate(): Promise<SystemConfigDocument>;
}

export const SystemConfig = mongoose.model<SystemConfigDocument, SystemConfigModel>(
  "SystemConfig",
  systemConfigSchema,
);
