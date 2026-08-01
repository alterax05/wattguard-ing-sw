/**
 * Test helper for database setup and teardown
 */
import mongoose from "mongoose";
import { User } from "../../models/User";
import { Invite } from "../../models/Invite";
import { PasswordResetToken } from "../../models/PasswordResetToken";

const TEST_MONGO_URI = process.env.MONGO_URI_TEST!;

export async function connectTestDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGO_URI, {
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
      connectTimeoutMS: 10000,
    });
  }
}

export async function disconnectTestDB() {
  await mongoose.disconnect();
}

export async function clearTestDB() {
  await Promise.all([
    User.deleteMany({}),
    Invite.deleteMany({}),
    PasswordResetToken.deleteMany({}),
  ]);
}
