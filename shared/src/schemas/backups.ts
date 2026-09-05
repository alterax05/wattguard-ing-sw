import { z } from "zod";

export const BackupDataSchema = z.object({
  backupAt: z.iso.datetime(),
  version: z.string(),
  collections: z.object({
    buildings: z.array(z.any()),
    sensors: z.array(z.any()),
    alerts: z.array(z.any()),
    users: z.array(z.any()),
    systemConfig: z.any(),
  }),
});

export type BackupData = z.infer<typeof BackupDataSchema>;

export const CreateBackupResponseSchema = z.object({
  success: z.literal(true),
  data: BackupDataSchema,
});

export type CreateBackupResponse = z.infer<typeof CreateBackupResponseSchema>;
