// Zero-credit, zero-key weather proxy. wttr.in is the primary back door (free,
// no key, no daily limit); Open-Meteo is the fallback. Output is normalized to
// the Open-Meteo shape (with WMO weather codes) the frontend expects.

// wttr.in uses its own weather code set — map the common ones to WMO codes so
// the frontend's wmo() label/icon map keeps working.
const WTTR_TO_WMO = {
  113: 0, 116: 2, 119: 3, 122: 3,
  143: 45, 248: 45, 260: 45,
  176: 61, 263: 51, 266: 53, 281: 66, 284: 67, 293: 51, 296: 61, 299: 63,
  302: 63, 305: 65, 308: 65, 311: 66, 314: 67, 317: 67, 350: 80, 353: 80, 356: 81, 359: 82,
  179: 71, 182: 66, 185: 66, 320: 71, 323: 71, 326: 73, 329: 73, 332: 75, 335: 75,
  368: 71, 371: 71, 374: 73, 377: 75, 227: 75, 230: 75, 338: 77,
  200: 95, 386: 95, 389: 95, 392: 95, 395: 95,
};
const wttrToWmo = (c) => WTTR_TO_WMO[Number(c)] ?? 3;

export default async function(req) {
  try {
    const body = await req.json().catch(() => ({}));
    let lat = Number(body.latitude);
    let lng = Number(body.longitude);
    let place = body.place || "";

    // 1. wttr.in (primary)
    try {
      const loc = (!isFinite(lat) || !isFinite(lng)) && body.city
        ? encodeURIComponent(String(body.city))
        : `${lat},${lng}`;
      const url = `https://wttr.in/${loc}?format=j1`;
      const r = await fetch(url, { headers: { "User-Agent": "RideXBot/1.0", "Accept": "application/json" } });
      if (r.ok) {
        const w = await r.json();
        const cur = w?.current_condition?.[0];
        const area = w?.nearest_area?.[0];
        if (cur) {
          const days = (w?.weather || []).slice(0, 5);
          const data = {
            current: {
              temperature_2m: Number(cur.temp_C),
              apparent_temperature: Number(cur.FeelsLikeC),
              relative_humidity_2m: Number(cur.humidity),
              weather_code: Number(cur.weatherCode),
              wind_speed_10m: Number(cur.windspeedKmph),
              is_day: 1,
            },
            daily: {
              time: days.map((d) => d.date),
              weather_code: days.map((d) => Number(d.hourly?.[4]?.weatherCode || d.hourly?.[0]?.weatherCode || 113)),
              temperature_2m_max: days.map((d) => Number(d.maxtempC)),
              temperature_2m_min: days.map((d) => Number(d.mintempC)),
              precipitation_probability_max: days.map((d) => Math.max(0, ...d.hourly?.map((h) => Number(h.chanceofrain || 0)) || [0])),
            },
          };
          if (area) place = `${area.areaName?.[0]?.value || ""}, ${area.country?.[0]?.value || ""}`.trim().replace(/,$/, "");
          return Response.json({ data, place, provider: "wttr.in" });
        }
      }
    } catch (e) { console.error("wttr.in failed:", e?.message || e); }

    // 2. geocode for Open-Meteo if only a city was given
    if ((!isFinite(lat) || !isFinite(lng)) && body.city) {
      const gUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(body.city))}&count=1&language=en&format=json`;
      const g = await fetch(gUrl, { headers: { "User-Agent": "RideXBot/1.0" } });
      if (g.ok) {
        const gj = await g.json();
        const hit = gj?.results?.[0];
        if (hit) { lat = hit.latitude; lng = hit.longitude; place = `${hit.name}, ${hit.country || ""}`.trim(); }
      }
    }

    if (!isFinite(lat) || !isFinite(lng)) {
      return Response.json({ error: "provide city or latitude/longitude" }, { status: 400 });
    }

    // 3. Open-Meteo fallback
    const wUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=5`;
    const r2 = await fetch(wUrl, { headers: { "User-Agent": "RideXBot/1.0" } });
    if (!r2.ok) {
      const t = await r2.text().catch(() => "");
      return Response.json({ error: `weather unavailable (${r2.status}): ${t.slice(0, 120)}` }, { status: 502 });
    }
    const data = await r2.json();
    return Response.json({ data, place, provider: "open-meteo" });
  } catch (error) {
    console.error("weather-proxy error:", error?.message || error);
    return Response.json({ error: error?.message || "unknown error" }, { status: 500 });
  }
}