/**
 * Weather Service Utilities
 */

interface Coordinates {
  lat: number;
  lon: number;
}

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

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      };
    }
    
    return null;
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

    const data = await response.json();
    if (data.hourly && data.hourly.temperature_2m) {
      const temps: number[] = data.hourly.temperature_2m;
      // Filter out nulls
      const validTemps = temps.filter((t) => t !== null);
      if (validTemps.length === 0) return null;

      const sum = validTemps.reduce((acc, curr) => acc + curr, 0);
      return sum / validTemps.length;
    }

    return null;
  } catch (error) {
    console.error("Error fetching weather data:", error);
    return null;
  }
}
