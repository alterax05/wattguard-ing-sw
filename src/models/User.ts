import mongoose, { Schema, Document } from "mongoose";

export type UserRole = "admin" | "operator";

export interface IUser extends Document {
  email: string;
  name?: string;
  role: UserRole;
  isDisabled: boolean;
  passwordHash?: string;
  googleSub?: string;
  lastLoginAt?: Date;
  passwordUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: false,
      trim: true,
    },
    role: {
      type: String,
      enum: ["admin", "operator"],
      required: true,
    },
    isDisabled: {
      type: Boolean,
      default: false,
    },
    passwordHash: {
      type: String,
      required: false,
    },
    googleSub: {
      type: String,
      required: false,
      unique: true,
      sparse: true, // allows multiple null values
    },
    lastLoginAt: {
      type: Date,
      required: false,
    },
    passwordUpdatedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model<IUser>("User", userSchema);
