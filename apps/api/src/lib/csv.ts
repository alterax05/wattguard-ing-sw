/** A single CSV cell: the primitive kinds produced by report row builders. */
export type CsvCellValue = string | number | boolean | Date | null | undefined;

function escapeCsvValue(value: CsvCellValue): string {
  if (value === null || value === undefined) return "";

  const text = value instanceof Date ? value.toISOString() : String(value);
  if (!/[",\r\n]/.test(text)) return text;

  return `"${text.replaceAll('"', '""')}"`;
}

/** Serialize rows as UTF-8 CSV with a CRLF line ending. */
export function serializeCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvCellValue[])[],
): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeCsvValue(cell)).join(","),
  );

  return `${lines.join("\r\n")}\r\n`;
}
