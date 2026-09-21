// trek = true  → rubber-tyre machine, drives itself on government roads (diesel kegs)
// trek = false → steel-track machine, must be carried by lowbed/flatbed
export const EQUIPMENT = [
  { category: "Excavators", model: "CAT 300.9D (Mini Excavator)", rate: 250000, trek: false },
  { category: "Excavators", model: "CAT 305.5E2 (Compact Excavator)", rate: 350000, trek: false },
  { category: "Excavators", model: "CAT 320GC (Medium Excavator)", rate: 550000, trek: false },
  { category: "Excavators", model: "CAT 336GC (Large Excavator)", rate: 850000, trek: false },
  { category: "Excavators", model: "CAT 374F (Ultra Large Excavator)", rate: 1400000, trek: false },
  { category: "Bulldozers", model: "CAT D3 (Small Bulldozer)", rate: 400000, trek: false },
  { category: "Bulldozers", model: "CAT D6 (Medium Bulldozer)", rate: 650000, trek: false },
  { category: "Bulldozers", model: "CAT D8 (Large Bulldozer)", rate: 1100000, trek: false },
  { category: "Bulldozers", model: "CAT D11 (Ultra Large Bulldozer)", rate: 2200000, trek: false },
  { category: "Backhoe Loaders", model: "CAT 416 (Backhoe Loader)", rate: 350000, trek: true },
  { category: "Backhoe Loaders", model: "CAT 450 (Large Backhoe Loader)", rate: 550000, trek: true },
  { category: "Wheel Loaders", model: "CAT 906 (Compact Wheel Loader)", rate: 250000, trek: true },
  { category: "Wheel Loaders", model: "CAT 950 (Medium Wheel Loader)", rate: 500000, trek: true },
  { category: "Wheel Loaders", model: "CAT 980 (Large Wheel Loader)", rate: 800000, trek: true },
  { category: "Motor Graders", model: "CAT 120 (Motor Grader)", rate: 500000, trek: true },
  { category: "Motor Graders", model: "CAT 140 (Heavy Motor Grader)", rate: 700000, trek: true },
  { category: "Motor Graders", model: "CAT 160 (Large Motor Grader)", rate: 900000, trek: true },
  { category: "Dump Trucks", model: "CAT 740 (Articulated Dump Truck)", rate: 600000, trek: true },
  { category: "Dump Trucks", model: "CAT 775 (Off-Highway Truck)", rate: 1000000, trek: true },
  { category: "Dump Trucks", model: "CAT 797 (Ultra Class Truck)", rate: 2500000, trek: true },
  { category: "Forklifts", model: "CAT GP20 (Forklift)", rate: 200000, trek: true },
  { category: "Forklifts", model: "CAT GP40 (Heavy Forklift)", rate: 350000, trek: true },
  { category: "Compactors", model: "CAT CS56 (Vibratory Compactor)", rate: 350000, trek: true },
  { category: "Compactors", model: "CAT CP74 (Pneumatic Compactor)", rate: 500000, trek: true },
  { category: "Skid Steer Loaders", model: "CAT 242D (Skid Steer Loader)", rate: 200000, trek: false },
  { category: "Skid Steer Loaders", model: "CAT 262D (Large Skid Steer Loader)", rate: 300000, trek: false },
  { category: "Telehandlers", model: "CAT TH255 (Telehandler)", rate: 350000, trek: true },
  { category: "Telehandlers", model: "CAT TH417 (Large Telehandler)", rate: 550000, trek: true },
];

export const EQUIPMENT_CATEGORIES = [...new Set(EQUIPMENT.map((e) => e.category))];

export const CARWASH_SERVICES = [
  { name: "Basic Wash", price: 10000, detail: "Exterior only" },
  { name: "Full Wash", price: 20000, detail: "Exterior + Interior" },
  { name: "Premium Detail", price: 50000, detail: "Full detail, wax, polish" },
  { name: "Express Wax", price: 15000, detail: "Quick protective wax" },
  { name: "Engine Bay Cleaning", price: 35000, detail: "Degrease + steam" },
  { name: "Headlight Restoration", price: 25000, detail: "Clarity restored" },
  { name: "Ceramic Coating", price: 150000, detail: "Long-term protection" },
];

export const RIDE_TYPES = [
  { key: "economy", label: "Economy", multiplier: 1, seats: 4 },
  { key: "comfort", label: "Comfort", multiplier: 1.4, seats: 4 },
  { key: "xl", label: "XL", multiplier: 1.9, seats: 6 },
  { key: "bike", label: "Bike", multiplier: 0.6, seats: 1 },
];

export const DELIVERY_SPEEDS = [
  { key: "express", label: "Express", eta: "1 hour", multiplier: 2.2, minutes: 60 },
  { key: "standard", label: "Standard", eta: "4 hours", multiplier: 1.4, minutes: 240 },
  { key: "economy", label: "Economy", eta: "Next day", multiplier: 1, minutes: 1440 },
];

export const CONTACT = {
  email: "cssmotionpictures@gmail.com",
  paystack_email: "conceptswaggaskillzents@gmail.com",
  website: "www.cssmotionpictures.com",
  social: "@CSSMotionPictures",
  opay: "8061197339",
  privacy: "https://www.ridexongo.com/privacy",
};

// AdMob config. The rewarded interstitial unit loads natively in the published
// mobile build; the web app shows real video ad creatives on click.
export const ADMOB = {
  publisher_id: "pub-1935728615811609",
  app_id: "ca-app-pub-1935728615811609~ride-x",
  rewarded_unit_id: "ca-app-pub-1935728615811609/rewarded",
};

export const SERVICES = [
  { key: "ride", name: "Ride X", tagline: "Bid your own fare", path: "/ride", emoji: "🚗" },
  { key: "logistics", name: "Logistics X", tagline: "Same-hour parcels", path: "/logistics", emoji: "📦" },
  { key: "equipment", name: "CSS Constructions", tagline: "Caterpillar hire", path: "/equipment", emoji: "🏗️" },
  { key: "venues", name: "Vibe & Tap", tagline: "Bars & restaurants", path: "/venues", emoji: "🍽️" },
  { key: "carwash", name: "Carwash X", tagline: "We come to you", path: "/carwash", emoji: "🧼" },
  { key: "movies", name: "CSS Motion Pictures", tagline: "Stream now", path: "/movies", emoji: "🎬" },
  { key: "sports", name: "Live Sports", tagline: "Free football streams", path: "/sports", emoji: "⚽" },
  { key: "music", name: "RIDE X Sounds", tagline: "Music & videos", path: "/music", emoji: "🎵" },
  { key: "aimaster", name: "RIDE X Song Master", tagline: "Master your tracks", path: "/ai-master", emoji: "🎚️" },
  { key: "marketplace", name: "Marketplace", tagline: "Buy & sell anything", path: "/marketplace", emoji: "🛍️" },
  { key: "tv", name: "TV Stations", tagline: "Live Nigerian TV", path: "/tv", emoji: "📺" },
  { key: "concerts", name: "Live Concerts", tagline: "Stream live shows", path: "/concerts", emoji: "🎤" },
  { key: "curators", name: "Curators", tagline: "Submit your songs", path: "/curators", emoji: "🎧" },
  { key: "promotion", name: "Promotions", tagline: "Boost your music", path: "/promotion", emoji: "🚀" },
  { key: "distribution", name: "Distribution", tagline: "Spotify, Apple Music", path: "/distribution", emoji: "💿" },
  { key: "events", name: "Live Events", tagline: "Tickets & concerts", path: "/events", emoji: "🎤" },
  { key: "competitions", name: "Competitions", tagline: "Weekly prizes", path: "/competitions", emoji: "🏆" },
  { key: "digital-market", name: "Digital Store", tagline: "Buy & sell digital", path: "/digital-market", emoji: "💾" },
  { key: "vip", name: "VIP Tiers", tagline: "Premium membership", path: "/vip", emoji: "💎" },
  { key: "licensing", name: "Licensing", tagline: "License your songs", path: "/licensing", emoji: "📜" },
  { key: "fan-clubs", name: "Fan Clubs", tagline: "Exclusive fan access", path: "/fan-clubs", emoji: "💜" },
  { key: "collaborations", name: "Collaborations", tagline: "Hire creatives", path: "/collaborations", emoji: "🤝" },
  { key: "approvals", name: "Approvals", tagline: "Review submissions", path: "/approvals", emoji: "✅" },
  { key: "influencers", name: "Influencers", tagline: "Auto-submit to creators", path: "/influencers", emoji: "🎯" },
  { key: "influencer-dashboard", name: "Influencer Dashboard", tagline: "Review & earn", path: "/influencer-dashboard", emoji: "📱" },
  { key: "talent", name: "Book Talent", tagline: "Book artists direct", path: "/talent", emoji: "🎤" },
  { key: "game", name: "The Forgotten Ones", tagline: "Epic RPG adventure", path: "/game", emoji: "🎮" },
];