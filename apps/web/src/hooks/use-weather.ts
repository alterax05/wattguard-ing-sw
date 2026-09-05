import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

export interface WeatherData {
  temperature: number
  humidity: number
  windSpeed: number
  weatherCode: number
}

const OpenMeteoCurrentWeatherSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    relative_humidity_2m: z.number(),
    wind_speed_10m: z.number(),
    weather_code: z.number(),
  }),
})

const TRENTO_COORDS = { lat: 46.0664, lon: 11.1257 }

async function fetchWeather(): Promise<WeatherData | null> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${TRENTO_COORDS.lat}&longitude=${TRENTO_COORDS.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe/Rome`
  )
  if (!res.ok) return null
  const parsed = OpenMeteoCurrentWeatherSchema.safeParse(await res.json())
  if (!parsed.success) return null
  const data = parsed.data
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
