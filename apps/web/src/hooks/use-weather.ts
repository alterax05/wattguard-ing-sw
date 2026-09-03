import { useQuery } from "@tanstack/react-query"

export interface WeatherData {
  temperature: number
  humidity: number
  windSpeed: number
  weatherCode: number
}

interface OpenMeteoCurrentWeather {
  current: {
    temperature_2m: number
    relative_humidity_2m: number
    wind_speed_10m: number
    weather_code: number
  }
}

const TRENTO_COORDS = { lat: 46.0664, lon: 11.1257 }

async function fetchWeather(): Promise<WeatherData | null> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${TRENTO_COORDS.lat}&longitude=${TRENTO_COORDS.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe/Rome`
  )
  if (!res.ok) return null
  // SAFETY: open-meteo returns exactly these `current` fields for the query requested above
  const data = (await res.json()) as OpenMeteoCurrentWeather
  return {
    temperature: data.current.temperature_2m,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    weatherCode: data.current.weather_code,
  }
}

export function useWeather() {
  return useQuery({
    queryKey: ["weather", "trento"],
    queryFn: fetchWeather,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}
