// CLUB COLORS — curated palettes for the famous clubs, deterministic for
// everything else (the same club always resolves to the same palette, hashed
// from its name). Used by the match posters and slip cards so every
// prediction carries its teams' real identity colors.

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const CLUBS = {
  arsenal: ["#ef0107", "#9b0303"],
  chelsea: ["#034694", "#022a5e"],
  liverpool: ["#c8102e", "#8a0b20"],
  manchestercity: ["#6cabdd", "#3d7fb5"],
  manchesterunited: ["#da291c", "#8e1a11"],
  tottenhamhotspur: ["#132257", "#0a1433"],
  everton: ["#003399", "#001f5c"],
  newcastleunited: ["#241f20", "#584f4c"],
  westhamunited: ["#7a263a", "#4a1624"],
  astonvilla: ["#670e36", "#3c0820"],
  realmadrid: ["#f5f0e6", "#b8a86a"],
  barcelona: ["#a50044", "#004d98"],
  atleticomadrid: ["#cb3524", "#1c2c5b"],
  bayernmunich: ["#dc052d", "#0066b2"],
  borussiadortmund: ["#fde100", "#7a7000"],
  juventus: ["#e8e8e8", "#5a5a5a"],
  inter: ["#0068a8", "#0e1130"],
  acmilan: ["#fb090b", "#0e0e0e"],
  napoli: ["#12a0d7", "#08618a"],
  psg: ["#004170", "#da291c"],
  marseille: ["#2faee0", "#0e5f7c"],
  ajax: ["#d2122e", "#8c0d1c"],
  psveindhoven: ["#ed1c24", "#a01117"],
  benfica: ["#da291c", "#9b1a11"],
  porto: ["#00428c", "#002a57"],
  celtic: ["#018749", "#015533"],
  rangers: ["#1b458f", "#0f2a57"],
  galatasaray: ["#a90432", "#fcbc0b"],
  fenerbahce: ["#ffed00", "#003366"],
  flamengo: ["#c52613", "#0e0e0e"],
  palmeiras: ["#006437", "#0d3f24"],
  corinthians: ["#0e0e0e", "#5a5a5a"],
  riverplate: ["#e00e1c", "#ffffff"],
  bocabiors: ["#0e2b5c", "#f5c400"],
  alhilal: ["#005baa", "#023e73"],
  alnassr: ["#f7d600", "#0e4d92"],
};

function hashHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

// Returns the club's [primary, secondary] colors. Curated for known clubs,
// deterministic HSL palette for the rest — never random, never inconsistent.
export function teamColors(name) {
  const k = norm(name);
  if (CLUBS[k]) return CLUBS[k];
  const h = hashHue(k || "club");
  return [`hsl(${h} 62% 46%)`, `hsl(${(h + 38) % 360} 48% 26%)`];
}