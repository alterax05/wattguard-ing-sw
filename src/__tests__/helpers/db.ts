/**
 * Test helper for database setup and teardown
 */
import mongoose from "mongoose";
import { User } from "../../models/User";
import { Invite } from "../../models/Invite";
import { PasswordResetToken } from "../../models/PasswordResetToken";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";
import { Alert } from "../../models/Alert";
import { MONGO_URI_TEST } from "../../config/variables";

export async function connectTestDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI_TEST, {
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
    SensorReading.deleteMany({}),
    Sensor.deleteMany({}),
    Building.deleteMany({}),
    BuildingType.deleteMany({}),
    Alert.deleteMany({}),
  ]);
}
