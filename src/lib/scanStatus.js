// LAST-SCAN STATUS REGISTRY — every pool scan records its outcome here so the
// rollover engine can tell an API_ERROR from a genuinely empty day (an
// off-season league returns a real zero), instead of silently swallowing a
// fetch failure as an empty pool. Errors are also console.error'd at the
// catch site — never invisible.

const status = new Map();

export function setScanStatus(sport, state, detail = "") {
  status.set(sport, { state, detail, at: Date.now() });
}

export function getScanStatus(sport) {
  return status.get(sport) || { state: "UNKNOWN", detail: "" };
}