// Curated HTML5 arcade catalog. Every slug here was verified to return HTTP 200
// from https://www.crazygames.com/embed/<slug> with NO X-Frame-Options header,
// so all of them play inside the in-app iframe player (no dead/404 games).
export const ARCADE_GAMES = [
  // ===== Action / 3D =====
  { name: "Smash Karts", category: "action", slug: "smash-karts", icon: "🛺", badge: "hot" },
  { name: "Getaway Shootout", category: "action", slug: "getaway-shootout", icon: "🔫", badge: "hot" },
  { name: "Rooftop Snipers", category: "action", slug: "rooftop-snipers", icon: "🎯" },
  { name: "Happy Wheels", category: "action", slug: "happy-wheels", icon: "🦽", badge: "hot" },
  { name: "Short Life", category: "action", slug: "short-life", icon: "🦴" },
  { name: "Kogama Battle", category: "action", slug: "kogama-battle", icon: "🧊" },
  { name: "Tanko.io", category: "action", slug: "tanko-io", icon: "🛡️" },
  { name: "Run 3", category: "action", slug: "run-3", icon: "🏃" },
  { name: "Eggy Car", category: "action", slug: "eggy-car", icon: "🥚" },
  { name: "Mafia Wars", category: "action", slug: "mafia-wars", icon: "🕴️" },
  { name: "Raft Wars", category: "action", slug: "raft-wars", icon: "🛶" },
  { name: "Narrow One", category: "action", slug: "narrow-one", icon: "🏹" },

  // ===== Shooting / FPS =====
  { name: "Krunker.io", category: "shooting", slug: "krunker-io", icon: "🔫", badge: "hot" },
  { name: "Tank Trouble", category: "shooting", slug: "tank-trouble", icon: "💥" },
  { name: "Archery World Tour", category: "shooting", slug: "archery-world-tour", icon: "🏹" },
  { name: "Bowman", category: "shooting", slug: "bowman", icon: "🎯" },
  { name: "Bowmaster", category: "shooting", slug: "bowmaster", icon: "🏹" },

  // ===== Sports =====
  { name: "Basketball Stars", category: "sports", slug: "basketball-stars", icon: "🏀", badge: "hot" },
  { name: "Soccer Skills", category: "sports", slug: "soccer-skills", icon: "⚽" },
  { name: "Volley Random", category: "sports", slug: "volley-random", icon: "🏐" },
  { name: "Boxing Random", category: "sports", slug: "boxing-random", icon: "🥊" },
  { name: "Boxing", category: "sports", slug: "boxing", icon: "🥊" },

  // ===== Arcade =====
  { name: "Paper.io", category: "arcade", slug: "paperio", icon: "🗺️", badge: "hot" },
  { name: "Block Blast", category: "arcade", slug: "block-blast", icon: "🧱" },
  { name: "Hexar.io", category: "arcade", slug: "hexario", icon: "⬡" },
  { name: "Helix Jump", category: "arcade", slug: "helix-jump", icon: "🌀", badge: "hot" },

  // ===== Puzzle =====
  { name: "Happy Glass", category: "puzzle", slug: "happy-glass", icon: "🥛" },

  // ===== Casual =====
  { name: "Doge Miner", category: "casual", slug: "doge-miner", icon: "🐕" },
  { name: "Cookie Clicker", category: "casual", slug: "cookie-clicker", icon: "🍪", badge: "hot" },

  // ===== Native canvas games (built-in, no external embed) =====
  { name: "Ride X Runner", category: "arcade", slug: "native-runner", native: true, engine: "mario", icon: "🏃", badge: "new" },
  { name: "Street Fighter", category: "action", slug: "native-fighter", native: true, engine: "fighter", icon: "⚔️", badge: "new" },
  { name: "Key Quest", category: "arcade", slug: "native-adventure", native: true, engine: "adventure", icon: "🗺️", badge: "new" },
  { name: "Turbo Racer", category: "arcade", slug: "native-racing", native: true, engine: "racing", icon: "🏎️", badge: "new" },
];

export const ARCADE_CATEGORIES = [
  { key: "all", label: "All" },
  { key: "action", label: "Action & 3D" },
  { key: "shooting", label: "Shooting / FPS" },
  { key: "sports", label: "Sports" },
  { key: "arcade", label: "Arcade" },
  { key: "puzzle", label: "Puzzle" },
  { key: "casual", label: "Casual" },
];

export const embedUrl = (slug) => `https://www.crazygames.com/embed/${slug}`;