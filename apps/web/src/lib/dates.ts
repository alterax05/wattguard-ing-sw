/**
 * Converts a Date into an ISO string, or `undefined` when the date is
 * missing or invalid. Use it at the API boundary so that invalid or
 * incomplete date ranges never reach the requests.
 */
export function toIsoDate(date: Date | undefined): string | undefined {
  if (!date || Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}
