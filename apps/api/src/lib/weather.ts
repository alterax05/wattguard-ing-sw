/**
 * Weather Service Utilities
 */
import { z } from "zod";

interface Coordinates {
  lat: number;
  lon: number;
}

// Nominatim /search returns a JSON array of place results; lat/lon are strings.
const NominatimSearchResultSchema = z
  .object({
    lat: z.string(),
    lon: z.string(),
  })
  .array()
  .min(1);

// Open-Meteo archive payload: hourly temperature series (null = missing value).
const OpenMeteoArchiveSchema = z.object({
  hourly: z.object({
    temperature_2m: z.array(z.number().nullable()),
  }),
});

/**
 * Geocode an address to coordinates using Nominatim (OpenStreetMap)
 */
export async function getCoordinates(address: string): Promise<Coordinates | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      address
    )}&format=json&limit=1`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "WattGuard/1.0", // Required by Nominatim
      },
    });

    if (!response.ok) {
      console.error("Geocoding failed:", response.statusText);
      return null;
    }

    const parsed = NominatimSearchResultSchema.safeParse(await response.json());
    if (!parsed.success) {
      return null;
    }

    const first = parsed.data[0];
    if (!first) {
      return null;
    }

    return {
      lat: parseFloat(first.lat),
      lon: parseFloat(first.lon),
    };
  } catch (error) {
    console.error("Error fetching coordinates:", error);
    return null;
  }
}

/**
 * Get historical temperature from Open-Meteo
 */
export async function getAverageHistoricalTemperature(
  lat: number,
  lon: number,
  startDate: Date,
  endDate: Date
): Promise<number | null> {
  try {
    // Format dates as YYYY-MM-DD
    const start = startDate.toISOString().split("T")[0];
    const end = endDate.toISOString().split("T")[0];

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&hourly=temperature_2m`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error("Weather API failed:", response.statusText);
      return null;
    }

    const parsed = OpenMeteoArchiveSchema.safeParse(await response.json());
    if (!parsed.success) {
      return null;
    }

    const temps: (number | null)[] = parsed.data.hourly.temperature_2m;
    // Filter out nulls
    const validTemps = temps.filter((t) => t !== null);
    if (validTemps.length === 0) return null;

    const sum = validTemps.reduce((acc, curr) => acc + curr, 0);
    return sum / validTemps.length;
  } catch (error) {
    console.error("Error fetching weather data:", error);
    return null;
  }
}
