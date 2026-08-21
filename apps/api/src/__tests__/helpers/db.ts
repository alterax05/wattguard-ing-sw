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
let replSetDataDir: string | undefined;

const CLEANUP_REGISTRY = Symbol.for("wattguard.mongoTestDataDirs");

interface MongoTestCleanupRegistry {
  dirs: Set<string>;
  installed: boolean;
}

/**
 * The registry lives on the `process` object — unlike module state it is
 * shared by every test file a worker executes, even across Bun's per-file
 * isolation — so one set of exit listeners covers all directories.
 */
function cleanupRegistry(): MongoTestCleanupRegistry {
  const proc = process as unknown as Record<
    symbol,
    MongoTestCleanupRegistry | undefined
  >;
  proc[CLEANUP_REGISTRY] ??= { dirs: new Set<string>(), installed: false };
  return proc[CLEANUP_REGISTRY]!;
}

function removeDataDirQuietly(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort — the next run's startup sweep catches leftovers
  }
}

function registerGuaranteedCleanup(dataDir: string): void {
  const registry = cleanupRegistry();
  registry.dirs.add(dataDir);
  if (registry.installed) return;
  registry.installed = true;

  // Synchronous on purpose: nothing async can run during "exit".
  const sweep = (): void => {
    for (const dir of registry.dirs) removeDataDirQuietly(dir);
    registry.dirs.clear();
  };

  process.once("exit", sweep);
  process.once("SIGINT", () => {
    sweep();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    sweep();
    process.exit(143);
  });
}

const DB_DIR_PREFIX = "wattguard-mongo-";
const STALE_DIR_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Last-resort net for hard kills (SIGKILL, OOM) where no exit handler runs:
 * on every server start, drop directories whose owning worker is gone or
 * that have gone stale. Directories of live workers are never touched.
 */
function sweepOrphanedDataDirs(): void {
  const registry = cleanupRegistry();
  for (const entry of fs.readdirSync(os.tmpdir())) {
    if (!entry.startsWith(DB_DIR_PREFIX)) continue;
    const full = path.join(os.tmpdir(), entry);
    if (registry.dirs.has(full)) continue;
    const ownerPid = Number(entry.slice(DB_DIR_PREFIX.length).split("-")[0]);
    let dead = true;
    if (Number.isInteger(ownerPid) && ownerPid > 0) {
      try {
        process.kill(ownerPid, 0);
        dead = false;
      } catch {
        dead = true;
      }
    }
    let expired: boolean;
    try {
      expired = Date.now() - fs.statSync(full).mtimeMs > STALE_DIR_MAX_AGE_MS;
    } catch {
      // vanished between readdir and stat — someone else cleaned it
      continue;
    }
    if (dead || expired) removeDataDirQuietly(full);
  }
}

async function getReplSet(): Promise<MongoMemoryReplSet> {
  if (!replSet) {
    sweepOrphanedDataDirs();
    // Own the data directory: the library only auto-removes tmpdirs it
    // created itself, and only on a graceful stop() that a timed-out hook
    // would skip. The pid is baked into the name so sibling workers can
    // tell live directories from orphans.
    const dataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `${DB_DIR_PREFIX}${process.pid}-`),
    );
    registerGuaranteedCleanup(dataDir);
    replSetDataDir = dataDir;
    // Single-node replica set: transactions (used by the alert pipeline)
    // require one. Generous timeout: a cold cache downloads mongod first.
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ dbPath: dataDir }],
    });
  }
  return replSet;
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
 * restore console output in `afterAll`. Hook timeouts are generous because a
 * busy machine runs several mongod instances side by side.
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
    await mongoose.connect(server.getUri(), {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
    });
  }, 120_000);

  if (clearBetweenTests) {
    beforeEach(clearDatabase, 30_000);
  }

  afterAll(async () => {
    await mongoose.disconnect();
    const owned = replSet;
    const ownedDir = replSetDataDir;
    replSet = undefined;
    replSetDataDir = undefined;
    if (owned) {
      // `force` removes our custom dbPath, which the library would otherwise
      // leave behind by design.
      await owned.stop({ doCleanup: true, force: true });
      cleanupRegistry().dirs.delete(ownedDir!);
    }
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }, 30_000);
}
