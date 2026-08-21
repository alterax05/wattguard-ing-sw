/**
 * Shared integration-test database harness.
 *
 * Spawns an in-memory MongoDB lazily (at most one per JavaScript context) and
 * gives every test file its own isolated database derived from the file path.
 * Under `bun test` files share one server; under `bun test --parallel` Bun
 * isolates each file (fresh globals, subprocesses reaped between files), so
 * every file transparently gets its own server instead.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

let replSet: MongoMemoryReplSet | undefined;

/**
 * Data directories live under the OS temp dir with our prefix and the owning
 * pid baked into the name. `bun test --parallel` force-kills mongod between
 * files, so mongodb-memory-server never runs its own cleanup — instead we
 * sweep directories whose owner is gone on every startup.
 */
const DB_PATH_PREFIX = path.join(os.tmpdir(), "wattguard-mongo-");
const STALE_DIR_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function sweepStaleDataDirectories(): void {
  for (const entry of fs.readdirSync(os.tmpdir())) {
    if (!entry.startsWith("wattguard-mongo-")) continue;
    const full = path.join(os.tmpdir(), entry);
    const pid = Number(entry.slice("wattguard-mongo-".length).split("-")[0]);
    let dead = true;
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        dead = false;
      } catch {
        dead = true;
      }
    }
    const expired =
      Date.now() - fs.statSync(full).mtimeMs > STALE_DIR_MAX_AGE_MS;
    if (dead || expired) {
      try {
        fs.rmSync(full, { recursive: true, force: true });
      } catch {
        // best effort — another worker may be racing us
      }
    }
  }
}

async function getReplSet(): Promise<MongoMemoryReplSet> {
  if (!replSet) {
    sweepStaleDataDirectories();
    const dbPath = `${DB_PATH_PREFIX}${process.pid}-${Date.now()}`;
    fs.mkdirSync(dbPath, { recursive: true });
    // Single-node replica set: transactions (used by the alert pipeline)
    // require one. Generous timeout: a cold cache downloads mongod first.
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ dbPath }],
    });
    const stop = () => {
      void replSet?.stop({ doCleanup: true });
    };
    process.once("exit", stop);
    process.once("SIGINT", () => {
      stop();
      process.exit(130);
    });
    process.once("SIGTERM", () => {
      stop();
      process.exit(143);
    });
  }
  return replSet;
}

function databaseNameFor(filePath: string): string {
  const dir = path.basename(path.dirname(filePath));
  const file = path.basename(filePath).replace(/\.test\.tsx?$/, "");
  return `${dir}-${file}`.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 60);
}

async function clearDatabase(): Promise<void> {
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

export interface SetupIntegrationTestsOptions {
  /** Set to false for suites that read but never write to the database. */
  clearBetweenTests?: boolean;
}

/**
 * Registers the standard database lifecycle hooks for one test file:
 * connect in `beforeAll`, wipe collections in `beforeEach`, disconnect and
 * restore console output in `afterAll`.
 */
export function setupIntegrationTests(
  filePath: string,
  { clearBetweenTests = true }: SetupIntegrationTestsOptions = {},
): void {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeAll(async () => {
    console.log = () => {};
    console.error = () => {};

    const server = await getReplSet();
    await mongoose.connect(server.getUri(databaseNameFor(filePath)), {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
    });
  }, 120_000);

  if (clearBetweenTests) {
    beforeEach(clearDatabase);
  }

  afterAll(async () => {
    await mongoose.disconnect();
    // Stop and clean up the data directory deterministically. `force` is
    // required because we own the dbPath: the library only auto-removes
    // tmpdirs it created itself.
    const owned = replSet;
    replSet = undefined;
    await owned?.stop({ doCleanup: true, force: true });
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });
}
