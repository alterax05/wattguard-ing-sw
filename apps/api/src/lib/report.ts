import path from "path";
import { Types } from "mongoose";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { Building } from "../models/Building";
import { Sensor } from "../models/Sensor";
import { SensorReading } from "../models/SensorReading";
import { Alert } from "../models/Alert";
import fullLogoUrl from "../assets/full-logo.png";
import {
  aggregateConsumptionForBuildings,
  aggregateDailyConsumptionForBuildings,
  getUtcEndOfDay,
  getUtcStartOfDay,
  isGasBoilerBuilding,
  type DailyConsumptionPoint,
  type PeriodConsumptionSummary,
} from "./consumption";

export type SensorTypeCounts = {
  internal_temp: number;
  external_temp: number;
  energy_meter: number;
  gas_meter: number;
};

export type BuildingReport = {
  id: string;
  name: string;
  address: string;
  buildingType: string | null;
  geographicZone: string;
  surface: number;
  heatingSystemType: string;
  status: string;
  isGasBoiler: boolean;
  consumption: PeriodConsumptionSummary;
  sensorCounts: SensorTypeCounts;
  readingCount: number;
  avgInternalTemp: number | null;
  avgExternalTemp: number | null;
  minExternalTemp: number | null;
  maxExternalTemp: number | null;
  alertCount: number;
  dailyConsumption: DailyConsumptionPoint[];
};

export type ReportData = {
  generatedAt: Date;
  startDate: string;
  endDate: string;
  buildings: BuildingReport[];
};

function emptySensorCounts(): SensorTypeCounts {
  return { internal_temp: 0, external_temp: 0, energy_meter: 0, gas_meter: 0 };
}

/**
 * Build the aggregated report data for the selected buildings and period.
 * All queries run batched over the building list (no per-building round trips).
 */
export async function buildReportData(
  buildingIds: string[],
  startDate: string,
  endDate: string,
): Promise<ReportData> {
  const objectIds = buildingIds.map((id) => new Types.ObjectId(id));
  const start = getUtcStartOfDay(startDate);
  const end = getUtcEndOfDay(endDate);

  const buildings = await Building.find({ _id: { $in: objectIds } })
    .populate<{ buildingType: { name: string } | null }>("buildingType", "name")
    .lean();

  const gasIds = buildings
    .filter((b) => isGasBoilerBuilding(b.heatingSystemType))
    .map((b) => b._id);
  const gasIdSet = new Set(gasIds.map((id) => id.toString()));

  const [
    consumptionMap,
    dailyMap,
    sensorCountRows,
    temperatureRows,
    alertRows,
  ] = await Promise.all([
    aggregateConsumptionForBuildings(objectIds, start, end, gasIds),
    aggregateDailyConsumptionForBuildings(objectIds, start, end, gasIds),
    Sensor.aggregate<{
      _id: { buildingId: Types.ObjectId; sensorType: keyof SensorTypeCounts };
      count: number;
    }>([
      { $match: { buildingId: { $in: objectIds } } },
      {
        $group: {
          _id: { buildingId: "$buildingId", sensorType: "$sensorType" },
          count: { $sum: 1 },
        },
      },
    ]),
    SensorReading.aggregate<{
      _id: Types.ObjectId;
      avgInternalTemp: number | null;
      avgExternalTemp: number | null;
      minExternalTemp: number | null;
      maxExternalTemp: number | null;
      readingCount: number;
    }>([
      {
        $match: {
          "metadata.buildingId": { $in: objectIds },
          timestamp: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$metadata.buildingId",
          avgInternalTemp: {
            $avg: {
              $cond: [{ $eq: ["$metadata.sensorType", "internal_temp"] }, "$value", null],
            },
          },
          avgExternalTemp: {
            $avg: {
              $cond: [{ $eq: ["$metadata.sensorType", "external_temp"] }, "$value", null],
            },
          },
          minExternalTemp: {
            $min: {
              $cond: [{ $eq: ["$metadata.sensorType", "external_temp"] }, "$value", null],
            },
          },
          maxExternalTemp: {
            $max: {
              $cond: [{ $eq: ["$metadata.sensorType", "external_temp"] }, "$value", null],
            },
          },
          readingCount: { $sum: 1 },
        },
      },
    ]),
    Alert.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          buildingId: { $in: objectIds },
          createdAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: "$buildingId", count: { $sum: 1 } } },
    ]),
  ]);

  const sensorCountMap = new Map<string, SensorTypeCounts>();
  for (const row of sensorCountRows) {
    const id = row._id.buildingId.toString();
    const counts = sensorCountMap.get(id) ?? emptySensorCounts();
    counts[row._id.sensorType] = (counts[row._id.sensorType] ?? 0) + row.count;
    sensorCountMap.set(id, counts);
  }

  const temperatureMap = new Map(
    temperatureRows.map((row) => [row._id.toString(), row]),
  );
  const alertMap = new Map(alertRows.map((row) => [row._id.toString(), row.count]));

  return {
    generatedAt: new Date(),
    startDate,
    endDate,
    buildings: buildings.map((building) => {
      const id = building._id.toString();
      const tempStats = temperatureMap.get(id);

      return {
        id,
        name: building.name,
        address: building.address,
        buildingType: building.buildingType?.name ?? null,
        geographicZone: building.geographicZone,
        surface: building.surface,
        heatingSystemType: building.heatingSystemType,
        status: building.status,
        isGasBoiler: gasIdSet.has(id),
        consumption:
          consumptionMap.get(id) ?? {
            totalEnergyKWh: 0,
            avgPowerKW: null,
            firstReadingAt: null,
            lastReadingAt: null,
          },
        sensorCounts: sensorCountMap.get(id) ?? emptySensorCounts(),
        readingCount: tempStats?.readingCount ?? 0,
        avgInternalTemp: tempStats?.avgInternalTemp ?? null,
        avgExternalTemp: tempStats?.avgExternalTemp ?? null,
        minExternalTemp: tempStats?.minExternalTemp ?? null,
        maxExternalTemp: tempStats?.maxExternalTemp ?? null,
        alertCount: alertMap.get(id) ?? 0,
        dailyConsumption: dailyMap.get(id) ?? [],
      };
    }),
  };
}

// ── PDF serialization (PDFKit) ───────────────────────────────────────────────

const PDF_PRIMARY = "#2563eb";
const PDF_MUTED = "#6b7280";
const PDF_LINE = "#d1d5db";

let logoPromise: Promise<Buffer | null> | null = null;

/** Load the WattGuard logo once; returns null when unavailable (PDF still renders). */
function loadLogo(): Promise<Buffer | null> {
  logoPromise ??= Bun.file(path.resolve(import.meta.dir, fullLogoUrl))
    .arrayBuffer()
    .then((buffer) => Buffer.from(buffer))
    .catch(() => null);
  return logoPromise;
}

function formatKwh(value: number): string {
  return `${value.toFixed(2)} kWh`;
}

function formatNum(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function drawSectionTitle(
  doc: PDFKit.PDFDocument,
  text: string,
  y: number,
): number {
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text(text, 48, y);
  doc
    .moveTo(48, y + 16)
    .lineTo(595 - 48, y + 16)
    .strokeColor(PDF_LINE)
    .lineWidth(0.75)
    .stroke();
  return y + 26;
}

function drawLabelValueRow(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  y: number,
): number {
  const labelWidth = 110;
  const valueWidth = 330;

  doc.font("Helvetica").fontSize(9).fillColor(PDF_MUTED);
  doc.text(label, 48, y, { width: labelWidth });
  const labelHeight = doc.heightOfString(label, { width: labelWidth });

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827");
  doc.text(value, 170, y, { width: valueWidth });
  const valueHeight = doc.heightOfString(value, { width: valueWidth });

  return y + Math.max(labelHeight, valueHeight) + 5;
}

function drawSummaryTable(doc: PDFKit.PDFDocument, data: ReportData, startY: number): number {
  const tableLeft = 48;
  const tableWidth = 595 - 96;
  const colWidths = [150, 80, 90, 80, 80, 70]; // name, type, zone, kWh, avg kW, alerts
  const headerY = drawSectionTitle(doc, "Riepilogo", startY);

  // Column headers
  const headers = [
    "Edificio",
    "Tipologia",
    "Zona",
    "Consumo",
    "Pot. media",
    "Allarmi",
  ];
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(PDF_MUTED);
  const headerCells = headers.map((header, i) => ({
    text: header,
    width: (colWidths[i] ?? 80) - 8,
  }));
  const headerHeight =
    Math.max(...headerCells.map((cell) => doc.heightOfString(cell.text, { width: cell.width }))) + 6;
  let x = tableLeft;
  for (const cell of headerCells) {
    doc.text(cell.text, x + 4, headerY + 6, { width: cell.width });
    x += cell.width + 8;
  }

  let y = headerY + headerHeight + 4;
  for (const building of data.buildings) {
    const values = [
      building.name,
      building.buildingType ?? "—",
      building.geographicZone,
      formatKwh(building.consumption.totalEnergyKWh),
      building.consumption.avgPowerKW === null
        ? "—"
        : `${building.consumption.avgPowerKW.toFixed(2)} kW`,
      String(building.alertCount),
    ];

    doc.font("Helvetica").fontSize(9).fillColor("#111827");
    const cells = values.map((value, i) => ({
      text: value,
      width: (colWidths[i] ?? 80) - 8,
    }));
    const rowHeight =
      Math.max(...cells.map((cell) => doc.heightOfString(cell.text, { width: cell.width }))) + 6;

    doc
      .moveTo(tableLeft, y + rowHeight)
      .lineTo(tableLeft + tableWidth, y + rowHeight)
      .strokeColor(PDF_LINE)
      .lineWidth(0.5)
      .stroke();

    x = tableLeft;
    for (const cell of cells) {
      doc.text(cell.text, x + 4, y + 2, { width: cell.width });
      x += cell.width + 8;
    }
    y += rowHeight;
  }
  return y + 10;
}

function drawDailyChart(
  doc: PDFKit.PDFDocument,
  points: DailyConsumptionPoint[],
  y: number,
): number {
  const chartLeft = 48;
  const chartTop = y;
  const chartWidth = 499;
  const chartHeight = 140;
  const axisPadding = 28;

  if (points.length === 0) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(PDF_MUTED)
      .text("Nessuna lettura nel periodo selezionato.", chartLeft, chartTop);
    return chartTop + 20;
  }

  const maxValue = Math.max(...points.map((p) => p.energyKWh), 1);
  const yMax = maxValue * 1.1;
  const plotWidth = chartWidth - axisPadding - 10;
  const plotHeight = chartHeight - 30;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const xAt = (i: number) => chartLeft + axisPadding + i * xStep;
  const yAt = (value: number) =>
    chartTop + 20 + plotHeight - (value / yMax) * plotHeight;

  // Grid lines + Y labels
  doc.font("Helvetica").fontSize(7).fillColor(PDF_MUTED);
  for (let i = 0; i <= 4; i++) {
    const gy = chartTop + 20 + (plotHeight / 4) * i;
    const value = yMax - (yMax / 4) * i;
    doc
      .moveTo(chartLeft + axisPadding, gy)
      .lineTo(chartLeft + axisPadding + plotWidth, gy)
      .strokeColor(PDF_LINE)
      .lineWidth(0.4)
      .stroke();
    doc.text(`${value.toFixed(0)}`, chartLeft + 2, gy - 4);
  }

  // Line
  doc
    .moveTo(xAt(0), yAt(points[0]!.energyKWh))
    .strokeColor(PDF_PRIMARY)
    .lineWidth(1.5);
  for (let i = 1; i < points.length; i++) {
    doc.lineTo(xAt(i), yAt(points[i]!.energyKWh));
  }
  doc.stroke();

  // Points + day labels (sparse)
  doc.fillColor(PDF_PRIMARY);
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));
  let lastLabelX = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const isLastPoint = i === points.length - 1;
    if (i % labelEvery === 0 || isLastPoint) {
      const labelX = xAt(i) - 12;
      if (labelX - lastLabelX >= 28) {
        doc.circle(xAt(i), yAt(points[i]!.energyKWh), 1.6).fill();
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .fillColor(PDF_MUTED)
          .text(points[i]!.date.toISOString().slice(5, 10), labelX, chartTop + 20 + plotHeight + 6, {
            width: 24,
            align: "center",
          });
        lastLabelX = labelX;
      } else if (isLastPoint) {
        doc.circle(xAt(i), yAt(points[i]!.energyKWh), 1.6).fill();
      }
    }
  }

  return chartTop + chartHeight + 10;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Attivo",
  inactive: "Inattivo",
  decommissioned: "Dismesso",
};

function drawBuildingSections(
  doc: PDFKit.PDFDocument,
  data: ReportData,
  logo: Buffer | null,
): void {
  data.buildings.forEach((building) => {
    doc.addPage();

    // Small logo mark, top-right
    if (logo) {
      doc.image(logo, 595 - 48 - 70, 44, { width: 70 });
    }

    // Title (may wrap to multiple lines for long names)
    const titleWidth = 595 - 48 - 70 - 24 - 48;
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827");
    doc.text(building.name, 48, 48, { width: titleWidth });
    const titleHeight = doc.heightOfString(building.name, { width: titleWidth });

    let y = 48 + titleHeight + 6;
    doc.font("Helvetica").fontSize(9).fillColor(PDF_MUTED);
    doc.text(
      `${building.address} · ${building.geographicZone} · ${building.buildingType ?? "—"}`,
      48,
      y,
      { width: titleWidth },
    );
    y += doc.heightOfString(
      `${building.address} · ${building.geographicZone} · ${building.buildingType ?? "—"}`,
      { width: titleWidth },
    ) + 10;

    // Metadata
    y = drawLabelValueRow(
      doc,
      "Stato",
      STATUS_LABELS[building.status] ?? building.status,
      y,
    );
    y = drawLabelValueRow(doc, "Tipo riscaldamento", building.heatingSystemType, y);
    y = drawLabelValueRow(doc, "Superficie", `${building.surface} m²`, y);
    y = drawLabelValueRow(doc, "Sensori", [
      `Temperatura interna: ${building.sensorCounts.internal_temp}`,
      `Temperatura esterna: ${building.sensorCounts.external_temp}`,
      `Energia: ${building.sensorCounts.energy_meter}`,
      `Gas: ${building.sensorCounts.gas_meter}`,
    ].join(" · "), y);
    y = drawLabelValueRow(doc, "Letture nel periodo", String(building.readingCount), y);
    y = drawLabelValueRow(
      doc,
      "Temperature",
      `Interna media: ${formatNum(building.avgInternalTemp, 1)}°C · Esterna media: ${formatNum(
        building.avgExternalTemp,
        1,
      )}°C (min ${formatNum(building.minExternalTemp, 1)}°C / max ${formatNum(
        building.maxExternalTemp,
        1,
      )}°C)`,
      y,
    );
    y += 6;

    // Consumption summary box
    doc
      .roundedRect(48, y, 180, 56, 6)
      .fillAndStroke("#eff6ff", "#bfdbfe");
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(PDF_MUTED)
      .text("Consumo nel periodo", 60, y + 8);
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor(PDF_PRIMARY)
      .text(formatKwh(building.consumption.totalEnergyKWh), 60, y + 22);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(PDF_MUTED)
      .text(
        `Potenza media: ${formatNum(building.consumption.avgPowerKW)} kW`,
        60,
        y + 42,
      );

    // Alerts box
    doc
      .roundedRect(244, y, 120, 56, 6)
      .fillAndStroke(building.alertCount > 0 ? "#fef2f2" : "#f9fafb", building.alertCount > 0 ? "#fecaca" : "#e5e7eb");
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(PDF_MUTED)
      .text("Allarmi nel periodo", 256, y + 8);
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor(building.alertCount > 0 ? "#dc2626" : "#111827")
      .text(String(building.alertCount), 256, y + 22);

    // Daily consumption chart
    const chartY = y + 72;
    drawSectionTitle(doc, "Consumo giornaliero", chartY);
    drawDailyChart(doc, building.dailyConsumption, chartY + 26);
  });
}

/** Serialize the report as a PDF document (A4, Italian labels). */
export async function serializeReportPdf(data: ReportData): Promise<Buffer> {
  const logo = await loadLogo();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Report header (first page)
    if (logo) {
      doc.image(logo, 48, 40, { width: 100 });
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#111827")
      .text("Report consumi energetici", 48, 80);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(PDF_MUTED)
      .text(
        `Periodo: ${data.startDate} – ${data.endDate}`,
        48,
        106,
      );
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(PDF_MUTED)
      .text(`Generato il: ${data.generatedAt.toISOString()}`, 48, 120);

    drawSummaryTable(doc, data, 140);

    drawBuildingSections(doc, data, logo);

    doc.end();
  });
}

// ── XLSX serialization (ExcelJS) ─────────────────────────────────────────────

function styleHeaderRow(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).height = 20;
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2563EB" },
  };
  sheet.getRow(1).alignment = { vertical: "middle" };
}

const XLSX_SUMMARY_COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: "Edificio", key: "name", width: 28 },
  { header: "Indirizzo", key: "address", width: 26 },
  { header: "Tipologia", key: "buildingType", width: 18 },
  { header: "Zona", key: "zone", width: 16 },
  { header: "Stato", key: "status", width: 12 },
  { header: "Superficie (m²)", key: "surface", width: 14 },
  { header: "Tipo riscaldamento", key: "heatingSystem", width: 20 },
  { header: "Consumo totale (kWh)", key: "totalKwh", width: 16, style: { numFmt: "0.00" } },
  { header: "Potenza media (kW)", key: "avgKw", width: 15, style: { numFmt: "0.00" } },
  { header: "Letture", key: "readings", width: 10 },
  { header: "Allarmi", key: "alerts", width: 10 },
  { header: "T. interna media (°C)", key: "avgInternal", width: 16, style: { numFmt: "0.0" } },
  { header: "T. esterna media (°C)", key: "avgExternal", width: 16, style: { numFmt: "0.0" } },
];

/** Serialize the report as an .xlsx workbook (Riepilogo + Consumo giornaliero sheets). */
export async function serializeReportXlsx(data: ReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WattGuard";
  workbook.created = data.generatedAt;

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const summary = workbook.addWorksheet("Riepilogo");
  styleHeaderRow(summary);
  summary.columns = XLSX_SUMMARY_COLUMNS;

  for (const building of data.buildings) {
    summary.addRow({
      name: building.name,
      address: building.address,
      buildingType: building.buildingType ?? "—",
      zone: building.geographicZone,
      status: STATUS_LABELS[building.status] ?? building.status,
      surface: building.surface,
      heatingSystem: building.heatingSystemType,
      totalKwh: building.consumption.totalEnergyKWh,
      avgKw: building.consumption.avgPowerKW ?? null,
      readings: building.readingCount,
      alerts: building.alertCount,
      avgInternal: building.avgInternalTemp ?? null,
      avgExternal: building.avgExternalTemp ?? null,
    });
  }

  // ── Daily consumption sheet ────────────────────────────────────────────────
  const daily = workbook.addWorksheet("Consumo giornaliero");
  styleHeaderRow(daily);
  daily.columns = [
    { header: "Edificio", key: "name", width: 28 },
    { header: "Data", key: "date", width: 14 },
    { header: "Consumo (kWh)", key: "kwh", width: 14, style: { numFmt: "0.00" } },
  ];

  for (const building of data.buildings) {
    if (building.dailyConsumption.length === 0) continue;
    for (const point of building.dailyConsumption) {
      daily.addRow({
        name: building.name,
        date: point.date.toISOString().slice(0, 10),
        kwh: point.energyKWh,
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
