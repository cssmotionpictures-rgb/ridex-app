// Zero-credit weather, fetched directly from Open-Meteo in the browser.
// Open-Meteo is keyless and sends permissive CORS headers, so no backend
// function / integration credit is needed. Output is normalized to the same
// shape the WeatherCard expects (current + daily, WMO weather codes).

export async function getWeather(opts = {}) {
  let lat = Number(opts.latitude);
  let lng = Number(opts.longitude);
  let place = opts.place || "";

  // Geocode a city name → lat/lng when no coordinates were given.
  if ((!isFinite(lat) || !isFinite(lng)) && opts.city) {
    const gUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(opts.city))}&count=1&language=en&format=json`;
    const g = await fetch(gUrl);
    if (g.ok) {
      const gj = await g.json();
      const hit = gj?.results?.[0];
      if (hit) {
        lat = hit.latitude;
        lng = hit.longitude;
        place = `${hit.name}, ${hit.country || ""}`.trim();
      }
    }
  }

  if (!isFinite(lat) || !isFinite(lng)) {
    throw new Error("Provide a city or coordinates");
  }

  const wUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=5`;
  const r = await fetch(wUrl);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Weather unavailable (${r.status}): ${t.slice(0, 120)}`);
  }
  const data = await r.json();
  if (!place) place = opts.city || "My location";
  return { data, place, provider: "open-meteo" };
}

// WMO weather code → { label, icon } helper map (icon names match lucide-react).
export const WMO_CODES = {
  0: { label: "Clear sky", icon: "Sun" },
  1: { label: "Mainly clear", icon: "Sun" },
  2: { label: "Partly cloudy", icon: "CloudSun" },
  3: { label: "Overcast", icon: "Cloud" },
  45: { label: "Fog", icon: "CloudFog" },
  48: { label: "Rime fog", icon: "CloudFog" },
  51: { label: "Light drizzle", icon: "CloudDrizzle" },
  53: { label: "Drizzle", icon: "CloudDrizzle" },
  55: { label: "Heavy drizzle", icon: "CloudDrizzle" },
  61: { label: "Light rain", icon: "CloudRain" },
  63: { label: "Rain", icon: "CloudRain" },
  65: { label: "Heavy rain", icon: "CloudRainWind" },
  66: { label: "Freezing rain", icon: "CloudRain" },
  67: { label: "Freezing rain", icon: "CloudRain" },
  71: { label: "Light snow", icon: "CloudSnow" },
  73: { label: "Snow", icon: "CloudSnow" },
  75: { label: "Heavy snow", icon: "CloudSnow" },
  77: { label: "Snow grains", icon: "CloudSnow" },
  80: { label: "Light showers", icon: "CloudRain" },
  81: { label: "Showers", icon: "CloudRain" },
  82: { label: "Heavy showers", icon: "CloudRainWind" },
  85: { label: "Snow showers", icon: "CloudSnow" },
  86: { label: "Snow showers", icon: "CloudSnow" },
  95: { label: "Thunderstorm", icon: "CloudLightning" },
  96: { label: "Thunderstorm + hail", icon: "CloudLightning" },
  99: { label: "Thunderstorm + hail", icon: "CloudLightning" },
};

export function wmo(code) {
  return WMO_CODES[code] || { label: "—", icon: "Cloud" };
}