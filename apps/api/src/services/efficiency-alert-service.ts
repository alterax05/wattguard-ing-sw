import { Building } from "../models/Building";
import { Alert } from "../models/Alert";
import { EFFICIENCY_ALERT_TYPE } from "../lib/alerts";
import { calculateBuildingEfficiency } from "../lib/efficiency";

// Finestra di valutazione fissa: 24h (decisione di prodotto, non configurabile).
const EFFICIENCY_ALERT_WINDOW_HOURS = 24;

export async function evaluateEfficiencyAlerts(): Promise<void> {
  const buildings = await Building.find({
    status: "active",
    "efficiencyThresholds.enabled": true,
  });

  const end = new Date();
  const start = new Date(end.getTime() - EFFICIENCY_ALERT_WINDOW_HOURS * 3_600_000);

  for (const building of buildings) {
    const minCop = building.efficiencyThresholds.minCop;
    if (minCop == null) continue;

    const cop = (await calculateBuildingEfficiency(building, start, end)).averageCop;
    if (cop == null) continue; // dati insufficienti o teleriscaldamento: silenzioso

    if (cop < minCop) {
      const existing = await Alert.findOne({
        buildingId: building._id,
        type: EFFICIENCY_ALERT_TYPE,
        status: "active",
      });
      if (!existing) {
        await Alert.create({
          buildingId: building._id,
          buildingName: building.name,
          type: EFFICIENCY_ALERT_TYPE,
          thresholdType: "min",
          severity: "high",
          message: `Efficienza impianto sotto soglia per ${building.name}: COP medio ${cop.toFixed(2)} (soglia minima: ${minCop})`,
          status: "active",
        });
      }
    } else {
      await Alert.updateMany(
        {
          buildingId: building._id,
          type: EFFICIENCY_ALERT_TYPE,
          status: { $in: ["active", "acknowledged"] },
        },
        { $set: { status: "resolved", resolvedBy: "Sistema", resolvedAt: new Date() } },
      );
    }
  }
}
