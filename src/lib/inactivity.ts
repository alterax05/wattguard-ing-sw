import type { ISensor } from "../models/Sensor";

/**
 * Returns true if a sensor should be considered inactive.
 *
 * A sensor is inactive when the elapsed time since its last reading exceeds
 * twice its configured transmission interval (2 × transmissionInterval seconds).
 *
 * Sensors with no reading yet are never auto-marked inactive.
 */
export function isInactive(sensor: ISensor): boolean {
  if (!sensor.lastReading?.timestamp) return false;
  const elapsedSeconds = (Date.now() - sensor.lastReading.timestamp.getTime()) / 1000;
  return elapsedSeconds > 2 * sensor.transmissionInterval;
}
