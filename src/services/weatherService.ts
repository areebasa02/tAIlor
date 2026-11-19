import { getApiUrl } from "../lib/aiHost"
import type { UserProfile, WeatherData } from "../types"

const HAMMOND_LAT = 30.5044
const HAMMOND_LON = -90.4612
const HAMMOND_CITY = "Hammond, LA"

function describeWmoWeatherCode(code: number): { label: string; icon: string } {
  if (code === 0) return { label: "Clear & Sunny", icon: "☀️" }
  if (code >= 1 && code <= 3) return { label: "Partly Cloudy", icon: "⛅" }
  if (code === 45 || code === 48) return { label: "Foggy", icon: "🌫️" }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { label: "Rain Showers", icon: "🌧️" }
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { label: "Snow", icon: "❄️" }
  }
  if (code >= 95 && code <= 99) return { label: "Thunderstorm", icon: "⛈️" }
  return { label: "Mild Skies", icon: "🌤️" }
}

function buildWeatherAdvice(tempF: number, code: number, windMph: number): string {
  const isRainy = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95
  if (isRainy) {
    return "Wet conditions ahead — add a water-resistant trench coat or jacket and avoid suede shoes."
  }
  if (tempF < 55) {
    return "Chilly air outside. Layering a knit sweater or structured coat keeps you warm."
  }
  if (tempF <= 68) {
    return windMph >= 12
      ? "Crisp and breezy weather. Pair breathable basics with a light outer layer."
      : "Cool, comfortable temperatures — balanced light layers work best all day."
  }
  if (tempF <= 79) {
    return "Mild warmth today. Breathable cotton or linen shirts keep outfits effortless."
  }
  return "Warm and humid outdoors — favor airy short sleeves, linen, and lighter neutrals."
}

/**
 * Fetches live temperature, WMO condition, and wardrobe advice from the free,
 * keyless Open-Meteo API for the given coordinates.
 */
export async function fetchOpenMeteoWeather(
  lat: number,
  lon: number,
  cityLabel: string,
): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`)
  }

  const data = (await res.json()) as {
    current?: {
      temperature_2m?: number
      apparent_temperature?: number
      weather_code?: number
      relative_humidity_2m?: number
      wind_speed_10m?: number
    }
  }

  const current = data.current
  if (!current || typeof current.temperature_2m !== "number") {
    throw new Error("Incomplete Open-Meteo payload")
  }

  const roundedTemp = Math.round(current.temperature_2m)
  const feelsLikeF =
    typeof current.apparent_temperature === "number"
      ? Math.round(current.apparent_temperature)
      : undefined
  const code = typeof current.weather_code === "number" ? current.weather_code : 1
  const windMph = typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : 0
  const humidity =
    typeof current.relative_humidity_2m === "number"
      ? Math.round(current.relative_humidity_2m)
      : undefined
  const { label, icon } = describeWmoWeatherCode(code)
  const temp = `${roundedTemp}°F`
  const ruleAdvice = buildWeatherAdvice(roundedTemp, code, windMph)

  return {
    city: cityLabel,
    temp,
    tempF: roundedTemp,
    feelsLikeF,
    condition: `${label} · ${temp}`,
    conditionLabel: label,
    humidity,
    windMph: Math.round(windMph),
    weatherCode: code,
    advice: ruleAdvice,
    ruleAdvice,
    adviceSource: "rule",
    icon,
  }
}

async function reverseGeocodeCity(lat: number, lon: number): Promise<string> {
  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`
    const res = await fetch(url)
    if (!res.ok) return "Your Area"
    const json = (await res.json()) as {
      city?: string
      locality?: string
      principalSubdivisionCode?: string
    }
    const cityName = json.city || json.locality
    if (!cityName) return "Your Area"
    const state = json.principalSubdivisionCode?.split("-").pop()
    return state ? `${cityName}, ${state}` : cityName
  } catch {
    return "Your Area"
  }
}

function getBrowserPosition(timeoutMs = 5000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Geolocation unavailable"))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: timeoutMs,
      maximumAge: 300000,
    })
  })
}

/**
 * Retrieves real-time weather using Open-Meteo without prompting on initial load
 * (defaulting to Hammond, LA) and optionally using browser GPS when requested.
 */
export async function fetchLiveWeather(options?: {
  requestGeolocation?: boolean
  fallback?: WeatherData
}): Promise<{ weather: WeatherData; source: "gps" | "hammond" | "fallback" }> {
  const requestGeo = Boolean(options?.requestGeolocation)

  if (requestGeo) {
    try {
      const pos = await getBrowserPosition(5000)
      const lat = pos.coords.latitude
      const lon = pos.coords.longitude
      const cityLabel = await reverseGeocodeCity(lat, lon)
      const weather = await fetchOpenMeteoWeather(lat, lon, cityLabel)
      return { weather, source: "gps" }
    } catch {
      // Geolocation denied, unavailable, or timed out — fall back to Hammond live weather
    }
  }

  try {
    const weather = await fetchOpenMeteoWeather(HAMMOND_LAT, HAMMOND_LON, HAMMOND_CITY)
    return { weather, source: "hammond" }
  } catch {
    const fallbackWeather: WeatherData = options?.fallback
      ? {
          ...options.fallback,
          adviceSource: options.fallback.adviceSource || "preset",
        }
      : {
          city: HAMMOND_CITY,
          temp: "64°F",
          tempF: 64,
          condition: "Partly Cloudy · 64°F",
          conditionLabel: "Partly Cloudy",
          advice: "Mild outdoor air. Breathable layers keep you comfortable through the day.",
          ruleAdvice: "Mild outdoor air. Breathable layers keep you comfortable through the day.",
          adviceSource: "rule",
          icon: "⛅",
        }
    return { weather: fallbackWeather, source: "fallback" }
  }
}

/**
 * Ask the local Qwen text model for short clothing advice tailored to both
 * the live Open-Meteo weather metrics and the user's preferences.
 */
export async function fetchAiWeatherAdvice(
  weather: WeatherData,
  user: UserProfile,
  signal?: AbortSignal,
): Promise<{ advice: string; model?: string }> {
  const derived = user.quizProfile?.derived
  const response = await fetch(getApiUrl("/api/weather/advice"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    signal,
    body: JSON.stringify({
      weather: {
        city: weather.city,
        temp: weather.temp,
        tempF: weather.tempF,
        feelsLikeF: weather.feelsLikeF,
        condition: weather.condition,
        conditionLabel: weather.conditionLabel,
        humidity: weather.humidity,
        windMph: weather.windMph,
        weatherCode: weather.weatherCode,
      },
      preferences: {
        preferredStyle: user.preferredStyle,
        homeClimate: user.homeClimate,
        stylistNotes: user.stylistNotes,
        sensorySensitive: Boolean(user.accessibility.sensorySensitive),
        lowDecisionMode: Boolean(user.accessibility.lowDecisionMode),
        fitFeel: derived?.filters?.fit_feel,
        easyClosures: Boolean(derived?.filters?.easy_closures),
        palette: derived?.color?.palette,
        mood: derived?.stylist?.mood_exploratory,
        attributes: derived?.wardrobe?.attribute_terms,
      },
    }),
  })

  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    throw new Error("Local AI host is offline or unreachable.")
  }

  const payload = (await response.json().catch(() => ({}))) as {
    advice?: string
    model?: string
    error?: string
  }

  if (!response.ok || typeof payload.advice !== "string" || !payload.advice.trim()) {
    throw new Error(payload.error || "Local model returned no weather advice.")
  }

  return {
    advice: payload.advice.trim(),
    model: payload.model,
  }
}
