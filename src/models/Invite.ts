import mongoose, { Schema, Document } from "mongoose";
import type { UserRole } from "./User";

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface IInvite extends Document {
  email: string;
  role: UserRole;
  tokenHash: string; // SHA-256 hash of the raw token
  status: InviteStatus;
  expiresAt: Date;
  createdBy: mongoose.Types.ObjectId; // admin user who created the invite
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inviteSchema = new Schema<IInvite>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["admin", "operator"],
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "revoked", "expired"],
      default: "pending",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    acceptedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically delete expired invites
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invite = mongoose.model<IInvite>("Invite", inviteSchema);
