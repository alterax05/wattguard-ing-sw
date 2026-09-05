/** Natural gas lower heating value (Italy standard), kWh per m³. */
export const GAS_LHV_KWH_PER_M3 = 10.55;

/** Air density, kg/m³. */
export const AIR_DENSITY = 1.225;

/** Specific heat of air, J/(kg·K). */
export const SPECIFIC_HEAT_AIR = 1005;

/**
 * Thermal capacity of a room: C = surface × height × ρ × cp (J/K).
 *
 * Shared by the efficiency estimator and the simulator so the building
 * physics cannot diverge between them.
 */
export function roomHeatCapacity(surface: number, ceilingHeight = 3.0): number {
  return surface * ceilingHeight * AIR_DENSITY * SPECIFIC_HEAT_AIR;
}
