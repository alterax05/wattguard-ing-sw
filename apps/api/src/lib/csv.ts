function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = value instanceof Date ? value.toISOString() : String(value);
  if (!/[",\r\n]/.test(text)) return text;

  return `"${text.replaceAll('"', '""')}"`;
}

/** Serialize rows as UTF-8 CSV with a CRLF line ending. */
export function serializeCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((value) => escapeCsvValue(value)).join(","),
  );

  return `${lines.join("\r\n")}\r\n`;
}
