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
import {
  raiseEfficiency,
  resolveEfficiencyForBuilding,
  computeDeviationSeverity,
  EFFICIENCY_ALERT_TYPE,
  SYSTEM_RESOLVER,
} from "../lib/alerts";
import { calculateBuildingEfficiency } from "../lib/efficiency";
import { queueAlertNotification } from "./notification-service";

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
        const result = await raiseEfficiency({
          buildingId: building._id,
          buildingName: building.name,
          cop,
          minCop,
        });
        if (!result.ok) {
          console.error(`Efficienza: errore nella creazione dell'alert per l'edificio ${String(building._id)}`);
        } else if (result.created) {
          queueAlertNotification("created", {
            type: EFFICIENCY_ALERT_TYPE,
            buildingName: building.name,
            value: Number(cop.toFixed(2)),
            unit: "COP",
            limit: minCop,
            severity: computeDeviationSeverity(cop, minCop),
          });
        }
      } else {
        const result = await resolveEfficiencyForBuilding({
          buildingId: building._id,
          actor: SYSTEM_RESOLVER,
        });
        if (!result.ok) {
          console.error(`Efficienza: errore nella risoluzione degli alert per l'edificio ${String(building._id)}`);
        } else if (result.resolved > 0) {
          queueAlertNotification("resolved", {
            type: EFFICIENCY_ALERT_TYPE,
            buildingName: building.name,
            value: Number(cop.toFixed(2)),
            unit: "COP",
            limit: minCop,
          });
        }
      }
    } catch (error) {
      console.error(`Efficienza: errore nella valutazione per l'edificio ${String(building._id)}`, error);
    }
  }
}
