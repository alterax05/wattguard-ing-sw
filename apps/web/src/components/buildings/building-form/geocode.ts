export const TRENTO_CENTER: [number, number] = [46.0667, 11.1167]
export const DEFAULT_ZOOM = 14

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lon: number } | null> {
  const params = new URLSearchParams({
    q: address,
    format: "json",
    limit: "1",
  })

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: { "User-Agent": "WattGuard/1.0" },
    }
  )

  if (!res.ok) return null

  // SAFETY: the Nominatim search endpoint returns a JSON array of places with lat/lon strings on 200.
  const results = (await res.json()) as { lat: string; lon: string }[]
  const first = results[0]
  if (!first) return null

  return {
    lat: parseFloat(first.lat),
    lon: parseFloat(first.lon),
  }
}
