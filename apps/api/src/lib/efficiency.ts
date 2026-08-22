import type { BuildingDocument } from "../models/Building";
import { SensorReading } from "../models/SensorReading";
import { getAverageHistoricalTemperature } from "./weather";
import {
  GAS_LHV_KWH_PER_M3,
  aggregateGasEnergyByBucket,
  energySensorTypeFor,
  isDistrictHeatingBuilding,
  isGasBoilerBuilding,
  roomHeatCapacity,
} from "./energy";
import type { GetBuildingEfficiencyResponse } from "@wattguard/shared";

export type BuildingEfficiencyMetrics = GetBuildingEfficiencyResponse["metrics"];

/**
 * Calcola le metriche di efficienza termica di un edificio su una finestra
 * temporale. Estratto dal route handler GET /api/buildings/:id/efficiency.
 * Il COP è null per teleriscaldamento o dati insufficienti.
 */
export async function calculateBuildingEfficiency(
  building: BuildingDocument,
  start: Date,
  end: Date,
): Promise<BuildingEfficiencyMetrics> {
      // ── Heating system classification ──────────────────────────────────────
      const isGasBoiler = isGasBoilerBuilding(building.heatingSystemType);
      const isDistrictHeating = isDistrictHeatingBuilding(building.heatingSystemType);

      // Physics Constants (for COP / heat-loss estimation)
      const CEILING_HEIGHT = building.ceilingHeight || 3.0; // meters (fallback to default)
      const ROOM_HEAT_CAPACITY = roomHeatCapacity(building.surface, CEILING_HEIGHT);

      // ── Sensor match ───────────────────────────────────────────────────────
      // Gas boiler buildings use gas_meter instead of energy_meter.
      const energySensorType = energySensorTypeFor(building.heatingSystemType);
      const sensorMatch = {
        "metadata.buildingId": building._id,
        timestamp: { $gte: start, $lte: end },
        "metadata.sensorType": { $in: [energySensorType, "internal_temp", "external_temp"] }
      };

      // ── Gas pre-aggregation ────────────────────────────────────────────────
      // For gas boiler buildings only: convert cumulative m³ readings into
      // per-minute average fuel power (kW), used by the physics pipeline.
      // Formula: power_kW = deltaM3 / deltaTHours × GAS_LHV_KWH_PER_M3
      let gasPowerByMinute = new Map<string, number>(); // minuteISO → kW

      if (isGasBoiler) {
        const gasBuckets = await aggregateGasEnergyByBucket(
          [building._id],
          start,
          end,
          1 * 60 * 1000,
        );
        const buckets = gasBuckets.get(building._id.toString());
        if (buckets) {
          gasPowerByMinute = new Map(
            [...buckets.values()].map((b) => [b.bucket.toISOString(), b.avgGasPowerKW]),
          );
        }
      }

      // ── Aggregation 1: Basic metrics ────────────────────────────────────────
      // For gas buildings: totalEnergyConsumed = (lastM3 − firstM3) × GAS_LHV_KWH_PER_M3
      // For others: avgPowerKW × elapsed hours.
      let totalEnergyConsumed = 0;
      let avgExternalTempFromBasic: number | null;

      if (isGasBoiler) {
        // Fetch first and last gas_meter readings in the period
        const [firstGas] = await SensorReading.find({
          "metadata.buildingId": building._id,
          timestamp: { $gte: start, $lte: end },
          "metadata.sensorType": "gas_meter",
        }).sort({ timestamp: 1 }).limit(1);

        const [lastGas] = await SensorReading.find({
          "metadata.buildingId": building._id,
          timestamp: { $gte: start, $lte: end },
          "metadata.sensorType": "gas_meter",
        }).sort({ timestamp: -1 }).limit(1);

        if (firstGas && lastGas && lastGas.value >= firstGas.value) {
          const consumedM3 = lastGas.value - firstGas.value;
          totalEnergyConsumed = Number((consumedM3 * GAS_LHV_KWH_PER_M3).toFixed(2));
        }

        // External temperature average for gas buildings
        const [extResult] = await SensorReading.aggregate<{
          avg: number | null;
        }>([
          {
            $match: {
              "metadata.buildingId": building._id,
              timestamp: { $gte: start, $lte: end },
              "metadata.sensorType": "external_temp",
            }
          },
          { $group: { _id: null, avg: { $avg: "$value" } } }
        ]);
        avgExternalTempFromBasic = extResult?.avg ?? null;

      } else {
        const [basicResult] = await SensorReading.aggregate<{
          totalEnergyConsumed: number | null;
          avgExternalTemp: number | null;
        }>([
          { $match: sensorMatch },
          {
            $group: {
              _id: null,
              avgPowerKW: {
                $avg: {
                  $cond: [
                    { $eq: ["$metadata.sensorType", "energy_meter"] },
                    // Normalise W → kW; values already in kW pass through as-is
                    { $cond: [{ $eq: ["$unit", "W"] }, { $divide: ["$value", 1000] }, "$value"] },
                    null
                  ]
                }
              },
              avgExternalTemp: {
                $avg: {
                  $cond: [{ $eq: ["$metadata.sensorType", "external_temp"] }, "$value", null]
                }
              },
              minTimestamp: { $min: "$timestamp" },
              maxTimestamp: { $max: "$timestamp" }
            }
          },
          {
            $project: {
              avgExternalTemp: 1,
              totalEnergyConsumed: {
                $round: [
                  {
                    $multiply: [
                      "$avgPowerKW",
                      { $divide: [{ $subtract: ["$maxTimestamp", "$minTimestamp"] }, 3600000] }
                    ]
                  },
                  2
                ]
              },
            }
          }
        ]);

        totalEnergyConsumed = basicResult?.totalEnergyConsumed ?? 0;
        avgExternalTempFromBasic = basicResult?.avgExternalTemp ?? null;
      }

      // ── Aggregation 2: Physics metrics (COP & heat-loss) ────────────────────
      // Requires ≥ 2 one-minute buckets with consecutive time deltas.
      // For gas buildings: powerWatts comes from the gas pre-aggregation map (joined in app code).
      // For other buildings: powerWatts comes from energy_meter readings in the bucket.
      // Returns null for avgH / averageCop when no cooling phases are detected.

      // Match only temperature sensors for gas buildings (energy handled separately above)
      const physicsSensorMatch = isGasBoiler
        ? {
            "metadata.buildingId": building._id,
            timestamp: { $gte: start, $lte: end },
            "metadata.sensorType": { $in: ["internal_temp", "external_temp"] }
          }
        : sensorMatch;

      type PhysicsBucket = {
        _id: Date;
        avgInternalTemp: number | null;
        avgExternalTemp: number | null;
        avgPowerKW: number | null;
      };

      const tempBuckets: PhysicsBucket[] = await SensorReading.aggregate([
        { $match: physicsSensorMatch },
        {
          $group: {
            _id: {
              $toDate: {
                $subtract: [
                  { $toLong: "$timestamp" },
                  { $mod: [{ $toLong: "$timestamp" }, 1 * 60 * 1000] }
                ]
              }
            },
            avgInternalTemp: {
              $avg: {
                $cond: [{ $eq: ["$metadata.sensorType", "internal_temp"] }, "$value", null]
              }
            },
            avgExternalTemp: {
              $avg: {
                $cond: [{ $eq: ["$metadata.sensorType", "external_temp"] }, "$value", null]
              }
            },
            avgPowerKW: {
              $avg: {
                $cond: [
                  { $eq: ["$metadata.sensorType", "energy_meter"] },
                  { $cond: [{ $eq: ["$unit", "W"] }, { $divide: ["$value", 1000] }, "$value"] },
                  null
                ]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // For gas buildings: inject gas power from the pre-aggregation map
      if (isGasBoiler) {
        for (const bucket of tempBuckets) {
          const key = bucket._id.toISOString();
          const gasPowerKW = gasPowerByMinute.get(key) ?? null;
          bucket.avgPowerKW = gasPowerKW;
        }
      }

      // Weather API fallback for external temperature
      const hasSensorExternalTemp = tempBuckets.some((b) => b.avgExternalTemp !== null)
        || avgExternalTempFromBasic !== null;

      let weatherFallbackExtTemp: number | null = null;
      if (!hasSensorExternalTemp) {
        weatherFallbackExtTemp = await getAverageHistoricalTemperature(
          building.location.coordinates[1]!,
          building.location.coordinates[0]!,
          start,
          end
        );
      }

      // Compute physics (H_est, COP) in application code from the per-minute buckets
      let avgH: number | null = null;
      let averageCop: number | null = null;

      if (tempBuckets.length >= 2) {
        const C = ROOM_HEAT_CAPACITY;
        const hEstimates: number[] = [];
        const copValues: {
          C: number;
          tempChangeRate: number;
          tempDiff: number;
          powerWatts: number;
        }[] = [];

        for (let i = 1; i < tempBuckets.length; i++) {
          const prev = tempBuckets[i - 1]!;
          const curr = tempBuckets[i]!;

          if (curr.avgInternalTemp === null || prev.avgInternalTemp === null) continue;

          const dtSeconds = (curr._id.getTime() - prev._id.getTime()) / 1000;
          if (dtSeconds <= 0) continue;

          const tempChange     = curr.avgInternalTemp - prev.avgInternalTemp;
          const tempChangeRate = tempChange / dtSeconds;
          const avgInternal    = (curr.avgInternalTemp + prev.avgInternalTemp) / 2;
          // Fall back to weather API temperature when no external_temp sensor data
          // is available for either the current or previous bucket.
          const avgExternal    = curr.avgExternalTemp ?? prev.avgExternalTemp ?? weatherFallbackExtTemp ?? null;
          const tempDiff       = avgExternal !== null ? avgInternal - avgExternal : null;
          const powerWatts     = curr.avgPowerKW !== null ? curr.avgPowerKW * 1000 : null;

          // H_est: only during natural cooling (heater off, temp falling, meaningful ΔT)
          if (
            powerWatts !== null && powerWatts < 10 &&
            tempChangeRate < 0 &&
            tempDiff !== null && Math.abs(tempDiff) > 2
          ) {
            const hEst = (-1 * C * tempChangeRate) / tempDiff;
            hEstimates.push(hEst);
          }

          // COP: only during heating (power > 100 W)
          if (
            powerWatts !== null && powerWatts > 100 &&
            tempDiff !== null
          ) {
            // avgH may not be computed yet — use best estimate so far (or 0 if none)
            // We'll do a second pass after avgH is determined
            copValues.push({ C, tempChangeRate, tempDiff, powerWatts });
          }
        }

        if (hEstimates.length > 0) {
          avgH = hEstimates.reduce((a, b) => a + b, 0) / hEstimates.length;
        }

        // Second pass for COP now that avgH is known
        if (avgH !== null && copValues.length > 0) {
          const cops = copValues.map(
            ({ C: c, tempChangeRate, tempDiff, powerWatts }) =>
              (c * tempChangeRate + avgH! * tempDiff) / powerWatts
          );
          averageCop = cops.reduce((a, b) => a + b, 0) / cops.length;
        }
      }

      // Fallback for average external temperature if not provided by sensors or basic aggregation: use weather API value
      let averageExternalTemperature: number | null = avgExternalTempFromBasic;
      if (averageExternalTemperature === null) {
        averageExternalTemperature = weatherFallbackExtTemp ?? await getAverageHistoricalTemperature(
          building.location.coordinates[1]!,
          building.location.coordinates[0]!,
          start,
          end
        );
      }

  return {
    totalEnergyConsumed,
    averageExternalTemperature: averageExternalTemperature !== null
      ? Number(averageExternalTemperature.toFixed(2))
      : null,
    estimatedHeatLossCoefficient: avgH ? Number(avgH.toFixed(2)) : null,
    insulationQuality: avgH && building.surface > 0
      ? Number((avgH / building.surface).toFixed(2))
      : null,
    // District heating: COP is a plant-level metric, meaningless at building level
    averageCop: isDistrictHeating
      ? null
      : averageCop ? Number(averageCop.toFixed(2)) : null,
  };
}
