/**
 * Shared integration-test database harness.
 *
 * Spawns an in-memory MongoDB lazily (at most one per JavaScript context) and
 * gives every test file its own isolated database derived from the file path.
 * Under `bun test` files share one server; under `bun test --parallel` Bun
 * isolates each file (fresh globals, subprocesses reaped between files), so
 * every file transparently gets its own server instead.
 *
 * Cleanup never depends on the hook lifecycle: a hook that exceeds the
 * runner's timeout aborts the file and `afterAll` is skipped entirely, so the
 * data directory is also registered for synchronous removal at process exit.
 */
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach } from "bun:test";
import { User } from "../../models/User";
import { Invite } from "../../models/Invite";
import { PasswordResetToken } from "../../models/PasswordResetToken";
import { BuildingType } from "../../models/BuildingType";
import { Building } from "../../models/Building";
import { Sensor } from "../../models/Sensor";
import { SensorReading } from "../../models/SensorReading";
import { Alert } from "../../models/Alert";


const MONGOD_VERSION = "8.0.29";

async function clearDatabase(): Promise<void> {
  await Promise.all([
    SensorReading.deleteMany({}),
    User.deleteMany({}),
    Invite.deleteMany({}),
    PasswordResetToken.deleteMany({}),
    Sensor.deleteMany({}),
    Building.deleteMany({}),
    BuildingType.deleteMany({}),
    Alert.deleteMany({}),
  ]);
}

/**
 * Registers the standard database lifecycle hooks for one test file:
 * connect in `beforeAll`, wipe collections in `beforeEach`, disconnect and
 * restore console output in `afterAll`. Hook timeouts are generous because a
 * busy machine runs several mongod instances side by side.
 */
export function setupIntegrationTests(cleanBetweenTest: boolean = true): void {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  let server: MongoMemoryReplSet;
  
  beforeAll(async () => {
    console.log = () => {};
    console.error = () => {};

    server = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: { version: MONGOD_VERSION }
    });

    await mongoose.connect(server.getUri(), {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
    });
  }, 120_000);

  beforeEach(async () => {
    if(cleanBetweenTest) {
      await clearDatabase()
    }
  }, 30_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await server.stop();
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }, 120_000);
}
