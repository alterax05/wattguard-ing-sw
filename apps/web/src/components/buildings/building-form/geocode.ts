import { z } from "zod"

export const TRENTO_CENTER: [number, number] = [46.0667, 11.1167]
export const DEFAULT_ZOOM = 14

const NominatimResultSchema = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
  })
)

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

  const parsed = NominatimResultSchema.safeParse(await res.json())
  if (!parsed.success) return null
  const first = parsed.data[0]
  if (!first) return null

  const lat = parseFloat(first.lat)
  const lon = parseFloat(first.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return { lat, lon }
}
