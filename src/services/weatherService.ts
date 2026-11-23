import { getApiUrl } from "../lib/aiHost"
import type { CalendarEvent, UserProfile, WeatherData } from "../types"

const HAMMOND_LAT = 30.5044
const HAMMOND_LON = -90.4612
const HAMMOND_CITY = "Hammond, LA"
const HAMMOND_TZ = "America/Chicago"
const LAST_LOCATION_KEY = "tailor_last_weather_location"

export type WeatherLocationSource =
  | "gps"
  | "city"
  | "ip"
  | "last-known"
  | "hammond"
  | "fallback"

export type WeatherFetchResult = {
  weather: WeatherData
  source: WeatherLocationSource
}

export type CitySearchResult = {
  id: string
  name: string
  label: string
  lat: number
  lon: number
  timeZone: string
  countryCode?: string
}

type StoredLocation = {
  lat: number
  lon: number
  city: string
  timeZone?: string
  savedAt: number
}

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

export function rememberWeatherLocation(location: {
  lat: number
  lon: number
  city: string
  timeZone?: string
}): void {
  if (typeof window === "undefined") return
  try {
    const payload: StoredLocation = {
      lat: location.lat,
      lon: location.lon,
      city: location.city,
      timeZone: location.timeZone,
      savedAt: Date.now(),
    }
    window.localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(payload))
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function readLastWeatherLocation(): StoredLocation | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LAST_LOCATION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredLocation
    if (
      typeof parsed?.lat !== "number" ||
      typeof parsed?.lon !== "number" ||
      typeof parsed?.city !== "string"
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Fetches live temperature, WMO condition, and wardrobe advice from the free,
 * keyless Open-Meteo API for the given coordinates.
 */
export async function fetchOpenMeteoWeather(
  lat: number,
  lon: number,
  cityLabel: string,
  options?: {
    timeZone?: string
    locationSource?: WeatherLocationSource
  },
): Promise<WeatherData> {
  const timezoneParam = options?.timeZone ? encodeURIComponent(options.timeZone) : "auto"
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph` +
    `&timezone=${timezoneParam}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`)
  }

  const data = (await res.json()) as {
    timezone?: string
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
  const timeZone =
    (typeof data.timezone === "string" && data.timezone) ||
    options?.timeZone ||
    undefined

  const weather: WeatherData = {
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
    lat,
    lon,
    timeZone,
    locationSource: options?.locationSource,
  }

  rememberWeatherLocation({
    lat,
    lon,
    city: cityLabel,
    timeZone,
  })

  return weather
}

async function reverseGeocodeCity(lat: number, lon: number): Promise<{
  city: string
  timeZone?: string
}> {
  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`
    const res = await fetch(url)
    if (!res.ok) return { city: "Your Area" }
    const json = (await res.json()) as {
      city?: string
      locality?: string
      principalSubdivisionCode?: string
      localityInfo?: { informative?: Array<{ name?: string; description?: string }> }
    }
    const cityName = json.city || json.locality
    if (!cityName) return { city: "Your Area" }
    const state = json.principalSubdivisionCode?.split("-").pop()
    return { city: state ? `${cityName}, ${state}` : cityName }
  } catch {
    return { city: "Your Area" }
  }
}

function getBrowserPosition(timeoutMs = 10_000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Geolocation unavailable"))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: timeoutMs,
      maximumAge: 120_000,
    })
  })
}

export async function searchCities(query: string, signal?: AbortSignal): Promise<CitySearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(trimmed)}` +
    `&count=6&language=en&format=json`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`City search HTTP ${res.status}`)
  const data = (await res.json()) as {
    results?: Array<{
      id?: number
      name?: string
      latitude?: number
      longitude?: number
      timezone?: string
      admin1?: string
      country_code?: string
      country?: string
    }>
  }
  return (data.results || [])
    .filter(
      (row) =>
        typeof row.latitude === "number" &&
        typeof row.longitude === "number" &&
        typeof row.name === "string" &&
        row.name.trim(),
    )
    .map((row) => {
      const parts = [row.name, row.admin1, row.country_code || row.country].filter(Boolean)
      return {
        id: String(row.id ?? `${row.name}-${row.latitude}-${row.longitude}`),
        name: row.name!,
        label: parts.join(", "),
        lat: row.latitude!,
        lon: row.longitude!,
        timeZone: row.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        countryCode: row.country_code,
      }
    })
}

export async function fetchWeatherForCity(
  city: CitySearchResult | { lat: number; lon: number; label: string; timeZone?: string },
): Promise<WeatherFetchResult> {
  const weather = await fetchOpenMeteoWeather(city.lat, city.lon, city.label, {
    timeZone: city.timeZone,
    locationSource: "city",
  })
  return { weather, source: "city" }
}

async function fetchIpApproxLocation(): Promise<{
  lat: number
  lon: number
  city: string
  timeZone?: string
} | null> {
  try {
    const res = await fetch("https://ipapi.co/json/", {
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      latitude?: number
      longitude?: number
      city?: string
      region_code?: string
      country_code?: string
      timezone?: string
      error?: boolean
    }
    if (json.error || typeof json.latitude !== "number" || typeof json.longitude !== "number") {
      return null
    }
    const cityBits = [json.city, json.region_code || json.country_code].filter(Boolean)
    return {
      lat: json.latitude,
      lon: json.longitude,
      city: cityBits.join(", ") || "Your Area",
      timeZone: typeof json.timezone === "string" ? json.timezone : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Retrieves real-time weather using Open-Meteo.
 * - Default load prefers last-known → quiet IP approx → Hammond (no GPS prompt).
 * - `requestGeolocation: true` asks the browser for current location (permission UX).
 */
export async function fetchLiveWeather(options?: {
  requestGeolocation?: boolean
  preferLastKnown?: boolean
  preferIpFallback?: boolean
  fallback?: WeatherData
}): Promise<WeatherFetchResult> {
  const requestGeo = Boolean(options?.requestGeolocation)
  const preferLastKnown = options?.preferLastKnown !== false
  const preferIpFallback = options?.preferIpFallback !== false

  if (requestGeo) {
    try {
      const pos = await getBrowserPosition(10_000)
      const lat = pos.coords.latitude
      const lon = pos.coords.longitude
      const place = await reverseGeocodeCity(lat, lon)
      const weather = await fetchOpenMeteoWeather(lat, lon, place.city, {
        timeZone: place.timeZone,
        locationSource: "gps",
      })
      return { weather, source: "gps" }
    } catch {
      // Denied / unavailable — continue through last-known → IP → Hammond.
    }
  }

  if (preferLastKnown) {
    const last = readLastWeatherLocation()
    if (last) {
      try {
        const weather = await fetchOpenMeteoWeather(last.lat, last.lon, last.city, {
          timeZone: last.timeZone,
          locationSource: "last-known",
        })
        return { weather, source: "last-known" }
      } catch {
        // Continue.
      }
    }
  }

  if (preferIpFallback && !requestGeo) {
    const ipPlace = await fetchIpApproxLocation()
    if (ipPlace) {
      try {
        const weather = await fetchOpenMeteoWeather(ipPlace.lat, ipPlace.lon, ipPlace.city, {
          timeZone: ipPlace.timeZone,
          locationSource: "ip",
        })
        return { weather, source: "ip" }
      } catch {
        // Continue to Hammond.
      }
    }
  }

  // After a denied GPS request, still try IP before Hammond so UX has a graceful path.
  if (preferIpFallback && requestGeo) {
    const ipPlace = await fetchIpApproxLocation()
    if (ipPlace) {
      try {
        const weather = await fetchOpenMeteoWeather(ipPlace.lat, ipPlace.lon, ipPlace.city, {
          timeZone: ipPlace.timeZone,
          locationSource: "ip",
        })
        return { weather, source: "ip" }
      } catch {
        // Continue.
      }
    }
  }

  try {
    const weather = await fetchOpenMeteoWeather(HAMMOND_LAT, HAMMOND_LON, HAMMOND_CITY, {
      timeZone: HAMMOND_TZ,
      locationSource: "hammond",
    })
    return { weather, source: "hammond" }
  } catch {
    const fallbackWeather: WeatherData = options?.fallback
      ? {
          ...options.fallback,
          adviceSource: options.fallback.adviceSource || "preset",
          locationSource: options.fallback.locationSource || "fallback",
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
          lat: HAMMOND_LAT,
          lon: HAMMOND_LON,
          timeZone: HAMMOND_TZ,
          locationSource: "fallback",
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
  calendarEvents: CalendarEvent[] = [],
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
        timeZone: weather.timeZone,
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
      calendarEvents: calendarEvents.slice(0, 8).map((event) => ({
        id: event.id,
        summary: event.summary,
        dtstart: event.dtstart,
        dtend: event.dtend,
        location: event.location,
        description: event.description,
        allDay: event.allDay,
        timeLabel: event.timeLabel,
      })),
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
