import type { SensorDocument } from "../models/Sensor";

//TODO: remove this function and use the method on the Sensor model instead

/**
 * Returns true if a sensor should be considered inactive.
 *
 * A sensor is inactive when the elapsed time since its last reading exceeds
 * twice its configured transmission interval (2 × transmissionInterval seconds).
 */
export function isInactive(sensor: SensorDocument, now = Date.now()): boolean {
  if (!sensor.lastReading?.timestamp) return true; // If there's no last reading, consider the sensor inactive
  const elapsedSeconds = (now - sensor.lastReading.timestamp.getTime()) / 1000;
  return elapsedSeconds > 2 * sensor.transmissionInterval;
}
