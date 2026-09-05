import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from "mongoose";
import { InviteStatusSchema, UserRoleSchema } from "@wattguard/shared";

const inviteSchema = new Schema(
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
      enum: UserRoleSchema.options,
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
      enum: InviteStatusSchema.options,
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
    toObject: {
      virtuals: true,
      flattenObjectIds: true,
    },
  }
);

export type InviteDocument = InferSchemaType<typeof inviteSchema>;

export type HydratedInvite = HydratedDocument<InviteDocument>;

// TTL index to automatically delete expired invites
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invite = mongoose.model("Invite", inviteSchema);
