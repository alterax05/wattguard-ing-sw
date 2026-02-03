import { Types } from "mongoose";
import { AuditLog, type AuditEntityType, type AuditAction } from "../models/AuditLog";

export interface CreateAuditLogParams {
  entityType: AuditEntityType;
  entityId: Types.ObjectId | string;
  action: AuditAction;
  changes: Record<string, any>;
  performedBy: Types.ObjectId | string;
}

/**
 * Create an audit log entry
 * 
 * @param params - Audit log parameters
 * @returns Promise<void>
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  try {
    await AuditLog.create({
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      changes: params.changes,
      performedBy: params.performedBy,
      timestamp: new Date(),
    });
  } catch (error) {
    // Log error but don't fail the main operation
    console.error("Failed to create audit log:", error);
  }
}

/**
 * Helper to capture changes between old and new objects
 * Useful for UPDATE operations to log only what changed
 * 
 * @param oldObject - Original object before update
 * @param newObject - Updated object
 * @returns Object containing before/after for changed fields
 */
export function captureChanges(
  oldObject: Record<string, any>,
  newObject: Record<string, any>
): Record<string, any> {
  const changes: Record<string, any> = {
    before: {},
    after: {},
  };

  // Fields to exclude from change tracking
  const excludeFields = ["__v", "updatedAt", "createdAt", "_id"];

  // Find all changed fields
  const allKeys = new Set([...Object.keys(oldObject), ...Object.keys(newObject)]);
  
  for (const key of allKeys) {
    if (excludeFields.includes(key)) continue;

    const oldValue = oldObject[key];
    const newValue = newObject[key];

    // Check if values are different (simple comparison)
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.before[key] = oldValue;
      changes.after[key] = newValue;
    }
  }

  return changes;
}

/**
 * Log a CREATE operation
 */
export async function logCreate(
  entityType: AuditEntityType,
  entityId: Types.ObjectId | string,
  entity: Record<string, any>,
  performedBy: Types.ObjectId | string
): Promise<void> {
  await createAuditLog({
    entityType,
    entityId,
    action: "create",
    changes: { created: entity },
    performedBy,
  });
}

/**
 * Log an UPDATE operation with before/after comparison
 */
export async function logUpdate(
  entityType: AuditEntityType,
  entityId: Types.ObjectId | string,
  oldEntity: Record<string, any>,
  newEntity: Record<string, any>,
  performedBy: Types.ObjectId | string
): Promise<void> {
  const changes = captureChanges(oldEntity, newEntity);
  
  await createAuditLog({
    entityType,
    entityId,
    action: "update",
    changes,
    performedBy,
  });
}

/**
 * Log a DELETE operation
 */
export async function logDelete(
  entityType: AuditEntityType,
  entityId: Types.ObjectId | string,
  entity: Record<string, any>,
  performedBy: Types.ObjectId | string
): Promise<void> {
  await createAuditLog({
    entityType,
    entityId,
    action: "delete",
    changes: { deleted: entity },
    performedBy,
  });
}
