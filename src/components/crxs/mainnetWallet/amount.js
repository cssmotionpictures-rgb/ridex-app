export function parseCrxsAmount(v) {
  const s = String(v || "").trim();
  if (!/^\d+(\.\d{1,18})?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  return BigInt(i + f.padEnd(18, "0")).toString();
}

export function formatRawAmount(raw) {
  const n = BigInt(raw || 0);
  const i = n / 10n ** 18n;
  const f = (n % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return f ? i + "." + f : String(i);
}

export function shortAddr(a) {
  return typeof a === "string" && a.length > 10 ? a.slice(0, 6) + "…" + a.slice(-4) : a;
}