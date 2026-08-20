import { Types } from "mongoose";
import { SensorReading } from "../../models/SensorReading";
import { GAS_LHV_KWH_PER_M3 } from "./constants";

export type GasEnergyBucket = {
  bucket: Date;
  deltaM3: number;
  deltaTHours: number;
  avgGasPowerKW: number;
  energyKWh: number;
};

/**
 * Shared gas-meter delta pipeline, parameterized by bucket size.
 *
 * Converts cumulative m³ readings into per-bucket deltas and applies the lower
 * heating value inside Mongo, so all gas energy math lives in one place. The
 * same pipeline serves the per-day energy aggregator (via `energyKWh`) and the
 * per-minute fuel-power buckets used by the efficiency estimator (via
 * `avgGasPowerKW`).
 *
 * Returns Map<buildingId, Map<bucketISO, GasEnergyBucket>>.
 */
export async function aggregateGasEnergyByBucket(
  buildingIds: Types.ObjectId[],
  start: Date,
  end: Date,
  bucketMs: number,
): Promise<Map<string, Map<string, GasEnergyBucket>>> {
  const rows = await SensorReading.aggregate<{
    _id: { buildingId: Types.ObjectId; bucket: Date };
    deltaM3: number;
    deltaTHours: number;
    avgGasPowerKW: number;
    energyKWh: number;
  }>([
    {
      $match: {
        "metadata.buildingId": { $in: buildingIds },
        timestamp: { $gte: start, $lte: end },
        "metadata.sensorType": "gas_meter",
      },
    },
    { $sort: { timestamp: 1 } },
    {
      $setWindowFields: {
        partitionBy: "$metadata.buildingId",
        sortBy: { timestamp: 1 },
        output: {
          prevValue: { $shift: { output: "$value", by: -1 } },
          prevTimestamp: { $shift: { output: "$timestamp", by: -1 } },
        },
      },
    },
    // Drop the first document (no previous reading → no delta)
    { $match: { prevValue: { $exists: true } } },
    {
      $addFields: {
        deltaM3: { $subtract: ["$value", "$prevValue"] },
        deltaTHours: {
          $divide: [
            { $subtract: [{ $toLong: "$timestamp" }, { $toLong: "$prevTimestamp" }] },
            3600000,
          ],
        },
        bucket: {
          $toDate: {
            $subtract: [
              { $toLong: "$timestamp" },
              { $mod: [{ $toLong: "$timestamp" }, bucketMs] },
            ],
          },
        },
        // Per-reading fuel power: (Δm³ / Δhours) × LHV → kW
        gasPowerKW: {
          $multiply: [
            { $divide: ["$deltaM3", "$deltaTHours"] },
            GAS_LHV_KWH_PER_M3,
          ],
        },
      },
    },
    // Discard negatives (meter resets) and zero-duration intervals
    { $match: { deltaM3: { $gte: 0 }, deltaTHours: { $gt: 0 } } },
    {
      $group: {
        _id: { buildingId: "$metadata.buildingId", bucket: "$bucket" },
        deltaM3: { $sum: "$deltaM3" },
        deltaTHours: { $sum: "$deltaTHours" },
        avgGasPowerKW: { $avg: "$gasPowerKW" },
      },
    },
    {
      $project: {
        deltaM3: 1,
        deltaTHours: 1,
        avgGasPowerKW: 1,
        energyKWh: { $multiply: ["$deltaM3", GAS_LHV_KWH_PER_M3] },
      },
    },
  ]);

  const result = new Map<string, Map<string, GasEnergyBucket>>();
  for (const row of rows) {
    const id = row._id.buildingId.toString();
    const key = row._id.bucket.toISOString();
    let buckets = result.get(id);
    if (!buckets) {
      buckets = new Map();
      result.set(id, buckets);
    }
    buckets.set(key, {
      bucket: row._id.bucket,
      deltaM3: row.deltaM3,
      deltaTHours: row.deltaTHours,
      avgGasPowerKW: row.avgGasPowerKW,
      energyKWh: row.energyKWh,
    });
  }
  return result;
}
