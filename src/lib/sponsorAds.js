import { base44 } from "@/api/base44Client";

// Fetch one active sponsor ad that still has budget, optionally filtered by
// placement (arcade / movies / music / any). Returns null if none available.
export async function fetchSponsorAd(placement = "any") {
  try {
    const list = await base44.entities.SponsorAd.filter({ status: "active" }, "-created_date", 100);
    const eligible = (list || [])
      .filter((a) => (a.remaining_budget ?? a.budget ?? 0) > 0)
      .filter((a) => placement === "any" || a.placement === "any" || a.placement === placement);
    if (!eligible.length) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  } catch {
    return null;
  }
}

// Report a completed play to the backend (service role) so the sponsor's
// budget decrements and revenue is tracked — works for anonymous users too.
export async function reportSponsorAdPlay(ad) {
  if (!ad?.id) return;
  try {
    await base44.functions.invoke("record-sponsor-ad-play", { ad_id: ad.id });
  } catch {}
}

// Resolve the creative to play for an ad slot. Prefers a paid sponsor ad;
// falls back to the supplied trailer videos when no sponsor is available.
export async function loadAdCreative(placement = "any", fallbackVideos = []) {
  const ad = await fetchSponsorAd(placement);
  if (ad && ad.video_url) {
    return {
      sponsorAd: ad,
      videoUrl: ad.video_url,
      isSponsor: true,
      sponsorName: ad.sponsor || ad.name,
      thumbnail: ad.thumbnail_url || "",
    };
  }
  const videoUrl = fallbackVideos.length ? fallbackVideos[Math.floor(Math.random() * fallbackVideos.length)] : "";
  return { sponsorAd: null, videoUrl, isSponsor: false, sponsorName: "", thumbnail: "" };
}