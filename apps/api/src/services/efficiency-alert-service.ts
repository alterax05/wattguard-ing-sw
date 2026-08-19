/**
 * Valutatore periodico dell'efficienza degli impianti (cron).
 *
 * Design:
 * - Finestra di valutazione fissa di 24h (decisione di prodotto, non configurabile):
 *   si calcola il COP medio sulle letture dell'ultima giornata solare.
 * - Isolamento errori per edificio: ogni edificio viene valutato in un blocco
 *   try/catch dedicato; un errore transitorio (es. aggregazione dati fallita in
 *   calculateBuildingEfficiency) viene loggato e l'edificio viene saltato,
 *   senza interrompere la valutazione degli edifici successivi.
 * - Race di deduplicazione ACCETTATA: il controllo dell'alert attivo esistente
 *   è check-then-create senza indice unico, stesso pattern accettato degli
 *   alert di soglia sensori in reading-service.ts. La finestra di race è di
 *   pochi millisecondi e si auto-risana alla risoluzione successiva.
 */
import { Building } from "../models/Building";
import { Alert } from "../models/Alert";
import { EFFICIENCY_ALERT_TYPE, SYSTEM_RESOLVER } from "../lib/alerts";
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
    try {
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
          { $set: { status: "resolved", resolvedBy: SYSTEM_RESOLVER, resolvedAt: new Date() } },
        );
      }
    } catch (error) {
      console.error(`Efficienza: errore nella valutazione per l'edificio ${building._id}`, error);
    }
  }
}
