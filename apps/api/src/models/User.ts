import mongoose, { Schema, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
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
    // TODO: quindi si può disabilitare un utente senza cancellarlo?
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

userSchema.pre('save', function() {
  if (this.isModified('password') && !this.isNew) {
    this.passwordUpdatedAt = new Date();
  }
});

export type UserDocument = InferSchemaType<typeof userSchema>;

export type UserRole = UserDocument["role"];

export const User = mongoose.model("User", userSchema);
