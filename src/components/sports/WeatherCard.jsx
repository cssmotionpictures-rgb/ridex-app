import React from "react";
import { getWeather, wmo } from "@/lib/weather";
import { Sun, Cloud, CloudSun, CloudFog, CloudDrizzle, CloudRain, CloudRainWind, CloudSnow, CloudLightning, MapPin, LocateFixed, Loader2, Droplets, Wind } from "lucide-react";

const ICONS = { Sun, Cloud, CloudSun, CloudFog, CloudDrizzle, CloudRain, CloudRainWind, CloudSnow, CloudLightning };

export default function WeatherCard() {
  const [data, setData] = React.useState(null);
  const [place, setPlace] = React.useState("Lagos");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async (opts) => {
    setLoading(true);
    setError("");
    try {
      const res = await getWeather(opts);
      setData(res?.data || null);
      if (res?.place) setPlace(res.place);
    } catch (e) {
      setError(e?.message || "Weather unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load({ city: "Lagos" }); }, [load]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return load({ city: "Lagos" });
    navigator.geolocation.getCurrentPosition(
      (pos) => load({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => load({ city: "Lagos" }),
      { timeout: 8000 }
    );
  };

  const cur = data?.current;
  const daily = data?.daily;
  const curCode = cur?.weather_code;
  const meta = wmo(curCode);
  const Icon = ICONS[meta.icon] || Cloud;
  const isDay = cur?.is_day !== 0;

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Loading live weather…</span>
      </div>
    );
  }

  if (error || !cur) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-amber-400/90">
        {error || "Weather unavailable right now."}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-secondary/40 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" /> {place}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <Icon className={`w-10 h-10 ${isDay ? "text-primary" : "text-blue-300"}`} />
            <div>
              <div className="text-3xl font-extrabold tabular-nums">{Math.round(cur.temperature_2m)}°C</div>
              <div className="text-xs text-muted-foreground">{meta.label}</div>
            </div>
          </div>
        </div>
        <button onClick={useMyLocation} className="inline-flex items-center gap-1 text-xs bg-secondary px-2.5 py-1.5 rounded-full hover:text-foreground text-muted-foreground" title="Use my location">
          <LocateFixed className="w-3.5 h-3.5" /> My loc
        </button>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
        <span className="flex items-center gap-1"><Droplets className="w-3.5 h-3.5" /> {cur.relative_humidity_2m}%</span>
        <span className="flex items-center gap-1"><Wind className="w-3.5 h-3.5" /> {Math.round(cur.wind_speed_10m)} km/h</span>
        <span className="text-muted-foreground/80">Feels {Math.round(cur.apparent_temperature)}°</span>
      </div>

      {daily?.time && (
        <div className="grid grid-cols-5 gap-1.5">
          {daily.time.slice(0, 5).map((d, i) => {
            const dm = wmo(daily.weather_code[i]);
            const DIcon = ICONS[dm.icon] || Cloud;
            return (
              <div key={d} className="rounded-lg bg-secondary/60 p-1.5 text-center">
                <div className="text-[10px] text-muted-foreground">
                  {i === 0 ? "Today" : new Date(d).toLocaleDateString("en-GB", { weekday: "short" })}
                </div>
                <DIcon className="w-5 h-5 mx-auto my-1 text-primary/90" />
                <div className="text-[11px] font-semibold tabular-nums">
                  {Math.round(daily.temperature_2m_max[i])}°
                  <span className="text-muted-foreground/70">/{Math.round(daily.temperature_2m_min[i])}°</span>
                </div>
                {daily.precipitation_probability_max?.[i] > 0 && (
                  <div className="text-[9px] text-blue-300">{daily.precipitation_probability_max[i]}%</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}