import mongoose, { Schema, type InferSchemaType } from "mongoose";

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

if (!inviteSchema.options.toObject) inviteSchema.options.toObject = {};

inviteSchema.options.toObject.transform = function (doc, ret: Record<string, unknown>) {
  ret.id = ret._id;
  delete ret._id;
  return ret;
};

export type InviteDocument = InferSchemaType<typeof inviteSchema>;

export type InviteStatus = InviteDocument["status"];

// TTL index to automatically delete expired invites
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invite = mongoose.model("Invite", inviteSchema);
