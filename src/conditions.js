const cache = new Map();
const cacheDurationMs = 10 * 60 * 1000;
const requestTimeoutMs = 8 * 1000;
const requestHeaders = {
  "User-Agent": "SurfSD local development (https://github.com/adamh02/SurfSD)"
};

export async function getSpotConditions(spot) {
  const cached = cache.get(spot.slug);
  if (cached && Date.now() - cached.createdAt < cacheDurationMs) {
    return cached.conditions;
  }

  const [swell, tide, weather] = await Promise.all([
    fetchSwell(),
    fetchTide(spot),
    fetchWeather(spot)
  ]);

  const conditions = {
    swell: swell || "Swell unavailable",
    tide: tide || "Tide unavailable",
    weather: weather || "Weather unavailable"
  };

  cache.set(spot.slug, { conditions, createdAt: Date.now() });
  return conditions;
}

export function placeholderConditions() {
  return {
    swell: "3-4 ft W swell",
    tide: "Mid rising",
    weather: "68 F, patchy marine layer"
  };
}

async function fetchSwell() {
  const text = await fetchText("https://www.ndbc.noaa.gov/data/realtime2/46225.txt");
  if (!text) return null;

  const lines = text.trim().split("\n").filter(Boolean);
  const headers = lines.find((line) => line.startsWith("#YY"))?.replace(/^#/, "").trim().split(/\s+/);
  const latest = lines.find((line) => !line.startsWith("#"))?.trim().split(/\s+/);
  if (!headers || !latest) return null;

  const values = Object.fromEntries(headers.map((header, index) => [header, latest[index]]));
  const waveMeters = Number(values.WVHT);
  const period = Number(values.DPD || values.APD);
  const direction = Number(values.MWD);
  if (!Number.isFinite(waveMeters)) return null;

  const waveFeet = Math.round(waveMeters * 3.28084 * 10) / 10;
  const directionLabel = Number.isFinite(direction) ? `${compassDirection(direction)} ` : "";
  const periodLabel = Number.isFinite(period) ? ` @ ${period}s` : "";
  return `${waveFeet} ft ${directionLabel}swell${periodLabel}`;
}

async function fetchTide(spot) {
  const station = spot.latitude >= 32.8 ? "9410230" : "9410170";
  return await fetchObservedTide(station) || await fetchPredictedTide(station);
}

async function fetchObservedTide(station) {
  const url = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  url.search = new URLSearchParams({
    range: "1",
    station,
    product: "water_level",
    datum: "MLLW",
    time_zone: "lst_ldt",
    units: "english",
    application: "SurfSD",
    format: "json"
  }).toString();

  const data = await fetchJson(url);
  return formatCurrentTide(data?.data);
}

async function fetchPredictedTide(station) {
  const url = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  url.search = new URLSearchParams({
    date: "today",
    station,
    product: "predictions",
    datum: "MLLW",
    time_zone: "lst_ldt",
    interval: "6",
    units: "english",
    application: "SurfSD",
    format: "json"
  }).toString();

  const data = await fetchJson(url);
  return formatCurrentTide(data?.predictions);
}

export function formatCurrentTide(readings = [], nowMs = Date.now()) {
  const parsedReadings = readings
    .map((reading) => ({
      value: Number(reading.v),
      date: parseLocalDate(reading.t)
    }))
    .filter((reading) => Number.isFinite(reading.value) && Number.isFinite(reading.date.getTime()))
    .sort((first, second) => first.date - second.date);

  if (parsedReadings.length < 2) return null;

  const pastReadings = parsedReadings.filter((reading) => reading.date.getTime() <= nowMs);
  const currentIndex = pastReadings.length ? pastReadings.length - 1 : 0;
  const current = parsedReadings[currentIndex];
  const comparison = parsedReadings[currentIndex - 1] || parsedReadings[currentIndex + 1];
  if (!current || !comparison) return null;

  return `${current.value.toFixed(1)} ft ${tideTrend(current.value, comparison.value, currentIndex > 0)}`;
}

function tideTrend(currentValue, comparisonValue, comparisonIsPrevious) {
  const change = comparisonIsPrevious ? currentValue - comparisonValue : comparisonValue - currentValue;
  if (Math.abs(change) < 0.02) return "steady";
  return change > 0 ? "rising" : "falling";
}

function parseLocalDate(value) {
  return new Date(String(value).replace(" ", "T"));
}

async function fetchWeather(spot) {
  const point = await fetchJson(`https://api.weather.gov/points/${spot.latitude},${spot.longitude}`);
  const hourlyUrl = point?.properties?.forecastHourly;
  if (!hourlyUrl) return null;

  const forecast = await fetchJson(hourlyUrl);
  const period = forecast?.properties?.periods?.[0];
  if (!period) return null;

  return `${period.temperature} F, ${period.shortForecast}, ${period.windSpeed} ${period.windDirection}`;
}

async function fetchJson(url) {
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function fetchText(url) {
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { headers: requestHeaders, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function compassDirection(degrees) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(degrees / 45) % directions.length];
}
