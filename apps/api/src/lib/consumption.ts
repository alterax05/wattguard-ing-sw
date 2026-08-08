import { Types } from "mongoose";
import { SensorReading } from "../models/SensorReading";

/** Natural gas lower heating value (Italy standard), kWh per m³. */
export const GAS_LHV_KWH_PER_M3 = 10.55;

/** Classify a building's heating system as a gas boiler. */
export function isGasBoilerBuilding(heatingSystemType: string): boolean {
  const heatingType = heatingSystemType.toLowerCase();
  return (
    heatingType.includes("gas") ||
    heatingType.includes("caldaia") ||
    heatingType.includes("centralizzato")
  );
}

/** Classify a building's heating system as district heating. */
export function isDistrictHeatingBuilding(heatingSystemType: string): boolean {
  const heatingType = heatingSystemType.toLowerCase();
  return (
    heatingType.includes("teleriscaldamento") ||
    heatingType.includes("district")
  );
}

export type EnergySensorType = "gas_meter" | "energy_meter";

/** Sensor type used as the primary energy source for a building. */
export function energySensorTypeFor(isGasBoiler: boolean): EnergySensorType {
  return isGasBoiler ? "gas_meter" : "energy_meter";
}

/** Start of the UTC day containing the given calendar date (YYYY-MM-DD). */
export function getUtcStartOfDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** End of the UTC day containing the given calendar date (YYYY-MM-DD). */
export function getUtcEndOfDay(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

export type DailyConsumptionPoint = {
  date: Date;
  energyKWh: number;
};

export type PeriodConsumptionSummary = {
  totalEnergyKWh: number;
  avgPowerKW: number | null;
  firstReadingAt: Date | null;
  lastReadingAt: Date | null;
};

/**
 * Aggregate daily energy consumption (kWh per UTC day) for many buildings.
 *
 * - Gas boiler buildings: cumulative m³ deltas converted with the LHV.
 * - Other buildings: average normalized power (kW) per day × 24 h.
 *
 * Energy pipelines are scoped to the matching building set, so a gas boiler
 * building's auxiliary energy_meter readings never mix into its gas series.
 * Returns a map of buildingId → daily points (sorted by date).
 */
export async function aggregateDailyConsumptionForBuildings(
  buildingIds: Types.ObjectId[],
  start: Date,
  end: Date,
  gasBuildingIds: Types.ObjectId[],
): Promise<Map<string, DailyConsumptionPoint[]>> {
  const results = new Map<string, DailyConsumptionPoint[]>();
  const gasIdStrings = new Set(gasBuildingIds.map((id) => id.toString()));
  const energyIdSet =
    gasBuildingIds.length > 0
      ? { $in: buildingIds.filter((id) => !gasIdStrings.has(id.toString())) }
      : { $in: buildingIds };
  const gasIdSet = { $in: gasBuildingIds };

  const [energyRows, gasRows] = await Promise.all([
    SensorReading.aggregate<{
      _id: { buildingId: Types.ObjectId; day: string };
      avgPowerKW: number;
    }>([
      {
        $match: {
          "metadata.buildingId": energyIdSet,
          timestamp: { $gte: start, $lte: end },
          "metadata.sensorType": "energy_meter",
        },
      },
      {
        $group: {
          _id: {
            buildingId: "$metadata.buildingId",
            day: {
              $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: "UTC" },
            },
          },
          avgPowerKW: {
            $avg: {
              $cond: [{ $eq: ["$unit", "W"] }, { $divide: ["$value", 1000] }, "$value"],
            },
          },
        },
      },
      { $sort: { "_id.day": 1 } },
    ]),
    SensorReading.aggregate<{
      _id: { buildingId: Types.ObjectId; day: string };
      deltaM3: number;
    }>([
      {
        $match: {
          "metadata.buildingId": gasIdSet,
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
          day: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: "UTC" },
          },
        },
      },
      { $match: { deltaM3: { $gte: 0 }, deltaTHours: { $gt: 0 } } },
      {
        $group: {
          _id: { buildingId: "$metadata.buildingId", day: "$day" },
          deltaM3: { $sum: "$deltaM3" },
        },
      },
      { $sort: { "_id.day": 1 } },
    ]),
  ]);

  for (const row of energyRows) {
    const id = row._id.buildingId.toString();
    const points = results.get(id) ?? [];
    points.push({
      date: getUtcStartOfDay(row._id.day),
      energyKWh: Number((row.avgPowerKW * 24).toFixed(2)),
    });
    results.set(id, points);
  }

  for (const row of gasRows) {
    const id = row._id.buildingId.toString();
    const points = results.get(id) ?? [];
    points.push({
      date: getUtcStartOfDay(row._id.day),
      energyKWh: Number((row.deltaM3 * GAS_LHV_KWH_PER_M3).toFixed(2)),
    });
    results.set(id, points);
  }

  for (const points of results.values()) {
    points.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // Buildings without any reading still get an empty array.
  for (const id of buildingIds) {
    if (!results.has(id.toString())) results.set(id.toString(), []);
  }

  return results;
}

/**
 * Aggregate total energy consumed per building in a period.
 *
 * - Gas boiler buildings: (last m³ − first m³) × LHV.
 * - Other buildings: average normalized power (kW) × elapsed hours.
 *
 * Returns a map of buildingId → summary (missing entries mean no readings).
 */
export async function aggregateConsumptionForBuildings(
  buildingIds: Types.ObjectId[],
  start: Date,
  end: Date,
  gasBuildingIds: Types.ObjectId[],
): Promise<Map<string, PeriodConsumptionSummary>> {
  const results = new Map<string, PeriodConsumptionSummary>();
  const idSet = { $in: buildingIds };
  const gasIdSet = { $in: gasBuildingIds };

  const [energyRows, gasRows] = await Promise.all([
    SensorReading.aggregate<{
      _id: Types.ObjectId;
      avgPowerKW: number;
      minTs: Date;
      maxTs: Date;
    }>([
      {
        $match: {
          "metadata.buildingId": idSet,
          timestamp: { $gte: start, $lte: end },
          "metadata.sensorType": "energy_meter",
        },
      },
      {
        $group: {
          _id: "$metadata.buildingId",
          avgPowerKW: {
            $avg: {
              $cond: [{ $eq: ["$unit", "W"] }, { $divide: ["$value", 1000] }, "$value"],
            },
          },
          minTs: { $min: "$timestamp" },
          maxTs: { $max: "$timestamp" },
        },
      },
    ]),
    SensorReading.aggregate<{
      _id: Types.ObjectId;
      firstValue: number;
      lastValue: number;
      firstTs: Date;
      lastTs: Date;
    }>([
      {
        $match: {
          "metadata.buildingId": gasIdSet,
          timestamp: { $gte: start, $lte: end },
          "metadata.sensorType": "gas_meter",
        },
      },
      { $sort: { timestamp: 1 } },
      {
        $group: {
          _id: "$metadata.buildingId",
          // $top = first element of the ascending timestamp order (earliest reading)
          firstValue: { $top: { output: "$value", sortBy: { timestamp: 1 } } },
          lastValue: { $bottom: { output: "$value", sortBy: { timestamp: 1 } } },
          firstTs: { $min: "$timestamp" },
          lastTs: { $max: "$timestamp" },
        },
      },
    ]),
  ]);

  for (const row of energyRows) {
    const hours = (row.maxTs.getTime() - row.minTs.getTime()) / 3600000;
    results.set(row._id.toString(), {
      totalEnergyKWh: Number((row.avgPowerKW * hours).toFixed(2)),
      avgPowerKW: Number(row.avgPowerKW.toFixed(2)),
      firstReadingAt: row.minTs,
      lastReadingAt: row.maxTs,
    });
  }

  for (const row of gasRows) {
    if (row.lastValue < row.firstValue) continue; // meter reset
    const totalEnergyKWh = Number(
      ((row.lastValue - row.firstValue) * GAS_LHV_KWH_PER_M3).toFixed(2),
    );
    const hours = (row.lastTs.getTime() - row.firstTs.getTime()) / 3600000;
    results.set(row._id.toString(), {
      totalEnergyKWh,
      avgPowerKW: hours > 0 ? Number((totalEnergyKWh / hours).toFixed(2)) : null,
      firstReadingAt: row.firstTs,
      lastReadingAt: row.lastTs,
    });
  }

  return results;
}
