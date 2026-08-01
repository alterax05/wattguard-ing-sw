import mongoose, { Schema } from "mongoose";

/**
 * SystemConfig - Singleton document storing system-wide configuration.
 * Only one document ever exists; use getOrCreate() to access it.
 */

export interface ISystemConfig {
  polling: {
    /** Frontend refetch interval in seconds for the realtime dashboard widget */
    intervalSeconds: number;
    /** Whether automatic polling is enabled */
    autoPollingEnabled: boolean;
  };
  notifications: {
    /** Whether email notifications are enabled */
    emailEnabled: boolean;
  };
  database: {
    /** Number of days to retain historical sensor readings */
    dataRetentionDays: number;
  };
}

const systemConfigSchema = new Schema<ISystemConfig>(
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

/**
 * Returns the single SystemConfig document, creating it with defaults if it
 * does not yet exist.
 */
systemConfigSchema.statics.getOrCreate =
  async function (): Promise<mongoose.Document & ISystemConfig> {
    const doc = await this.findOneAndUpdate(
      {},
      { $setOnInsert: {} },
      { upsert: true, setDefaultsOnInsert: true, returnDocument: "after" },
    );
    return doc;
  };

interface SystemConfigModel extends mongoose.Model<ISystemConfig> {
  getOrCreate(): Promise<mongoose.Document & ISystemConfig>;
}

export const SystemConfig = mongoose.model<ISystemConfig, SystemConfigModel>(
  "SystemConfig",
  systemConfigSchema,
);
