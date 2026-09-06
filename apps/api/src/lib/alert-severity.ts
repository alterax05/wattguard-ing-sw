import type { AlertSeverity } from "@wattguard/shared";

const LOW_MAX_DEVIATION_PCT = 10;
const MEDIUM_MAX_DEVIATION_PCT = 25;
const HIGH_MAX_DEVIATION_PCT = 50;

export function computeDeviationSeverity(
  value: number,
  limit: number | null | undefined,
): AlertSeverity {
  if (limit == null || limit === 0) return "high";

  const deviationPct = (Math.abs(value - limit) / Math.abs(limit)) * 100;

  if (deviationPct < LOW_MAX_DEVIATION_PCT) return "low";
  if (deviationPct < MEDIUM_MAX_DEVIATION_PCT) return "medium";
  if (deviationPct < HIGH_MAX_DEVIATION_PCT) return "high";
  return "critical";
}
