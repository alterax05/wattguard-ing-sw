/**
 * Script to create the first admin user
 * Usage: bun run scripts/create-first-admin.ts
 */
import mongoose from "mongoose";
import { User } from "../src/models/User";

const MONGO_URI = process.env.MONGO_URI!;

async function createFirstAdmin() {
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // Check if any admin exists
  const existingAdmin = await User.findOne({ role: "admin" });
  if (existingAdmin) {
    console.log("⚠️  An admin user already exists:");
    console.log(`   Email: ${existingAdmin.email}`);
    console.log("   Delete it first if you want to create a new one.");
    process.exit(1);
  }

  const email = process.env.ADMIN_EMAIL || "admin@wattguard.local";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  if (password.length < 8) {
    console.error("❌ Password must be at least 8 characters");
    process.exit(1);
  }

  console.log(`\n📝 Creating admin user...`);
  console.log(`   Email: ${email}`);

  const passwordHash = await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });

  await User.create({
    email: email.toLowerCase().trim(),
    name: "Admin User",
    role: "admin",
    isDisabled: false,
    passwordHash,
    passwordUpdatedAt: new Date(),
  });

  console.log("✅ Admin user created successfully!");
  console.log("\n📋 Login credentials:");
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log("\n⚠️  Change the password after first login!");

  await mongoose.disconnect();
  process.exit(0);
}

createFirstAdmin().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
