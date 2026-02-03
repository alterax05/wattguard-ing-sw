import mongoose, { Schema, Document, Types } from "mongoose";

export type AuditEntityType = "building" | "sensor";
export type AuditAction = "create" | "update" | "delete";

export interface IAuditLog {
  entityType: AuditEntityType;
  entityId: Types.ObjectId;
  action: AuditAction;
  changes: Record<string, any>; // Snapshot of changes (before/after for updates)
  performedBy: Types.ObjectId;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    entityType: {
      type: String,
      enum: ["building", "sensor"],
      required: true,
      index: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["create", "update", "delete"],
      required: true,
      index: true,
    },
    changes: {
      type: Schema.Types.Mixed,
      required: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
  },
  {
    // Disable timestamps since we have our own timestamp field
    timestamps: false,
  }
);

auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditLogSchema.index({ performedBy: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
