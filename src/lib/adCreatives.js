import { base44 } from "@/api/base44Client";

// Fallback creatives (used only before the catalog loads or if it's empty).
const FALLBACK = [
  "https://www.w3schools.com/html/mov_bbb.mp4",
  "https://www.w3schools.com/html/movie.mp4",
  "https://media.w3.org/2010/05/sintel/trailer.mp4",
];

// Returns a list of reachable video URLs to use as ad creatives. Pulls the
// platform's own published movie trailers (same-host, no CORS/403 issues) so
// the ad always plays, with a static fallback.
export async function loadAdVideos(limit = 8) {
  try {
    const movies = await base44.entities.Movie.list("-view_count", limit);
    const urls = (movies || [])
      .filter((m) => m.status === "published" && m.video_url)
      .map((m) => m.video_url);
    return urls.length ? urls : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export { FALLBACK };