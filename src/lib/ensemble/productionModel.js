// PRODUCTION MODEL RESOLUTION — the prediction-generation layer's link to the
// promotion registry. The learning cycle's promotion gate updates the
// ActiveModel registry; this module resolves what that means for THIS engine
// build at generation time, and the resolution is stamped into every new
// prediction snapshot — the prediction record itself proves which production
// model was active when it was made. A version the registry names but this
// build does not contain is never silently stamped; it is flagged.
import { getActiveModel } from "@/lib/globalLearning/activeModel";
import { RX_MODEL_VERSION } from "./engine";
import { RX21_MODEL_VERSION } from "./rx21Core";

export function resolveProductionModel({
  registry,
  engineVersion = RX_MODEL_VERSION,
  challengerVersion = RX21_MODEL_VERSION,
}) {
  const champion = String(registry?.champion_version || "");
  const base = {
    registry_champion: champion,
    registry_status: registry?.promotion_status || "",
    resolved_at: new Date().toISOString(),
  };
  // Registry not read (first run, throttled) — the champion engine is the
  // honest fallback, and the fallback is labelled as such.
  if (!champion || String(registry?.promotion_status || "").includes("REGISTRY NOT READ")) {
    return {
      ...base,
      production_version: engineVersion,
      role: `REGISTRY NOT READ — CHAMPION ENGINE ${engineVersion} ACTIVE (FALLBACK)`,
      registry_match: null,
      promoted: false,
    };
  }
  if (champion === engineVersion) {
    return {
      ...base,
      production_version: engineVersion,
      role: "CHAMPION ENGINE — REGISTRY-CONFIRMED",
      registry_match: true,
      promoted: false,
    };
  }
  if (champion === challengerVersion) {
    return {
      ...base,
      production_version: challengerVersion,
      role: "PROMOTED CHALLENGER — THE CHALLENGER IS THE PRODUCTION MODEL",
      registry_match: true,
      promoted: true,
    };
  }
  return {
    ...base,
    production_version: engineVersion,
    role: `REGISTRY CHAMPION ${champion} NOT IN THIS ENGINE BUILD — ENGINE CONTINUES ON ${engineVersion}, FLAGGED`,
    registry_match: false,
    promoted: false,
  };
}

export async function getProductionModel() {
  const registry = await getActiveModel();
  return resolveProductionModel({ registry });
}