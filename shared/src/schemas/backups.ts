import { z } from "zod";
import { BuildingSummarySchema } from "./buildings";
import { SensorSchema } from "./sensors";
import { AlertSchema } from "./alerts";
import { UserSchema } from "./common";
import { SystemConfigSchema } from "./settings";

export const BackupDataSchema = z.object({
  backupAt: z.iso.datetime(),
  version: z.string(),
  collections: z.object({
    buildings: z.array(BuildingSummarySchema),
    sensors: z.array(SensorSchema),
    alerts: z.array(AlertSchema),
    users: z.array(UserSchema),
    systemConfig: SystemConfigSchema,
  }),
});

export type BackupData = z.infer<typeof BackupDataSchema>;

export const CreateBackupResponseSchema = z.object({
  success: z.literal(true),
  data: BackupDataSchema,
});

export type CreateBackupResponse = z.infer<typeof CreateBackupResponseSchema>;
