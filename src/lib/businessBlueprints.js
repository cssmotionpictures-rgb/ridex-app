// Nigerian single-person small-capital business blueprints.
// All static content — works fully offline, no backend / integration credits.
// Capital tiers: ₦200k, ₦500k, ₦1m, ₦2m.

export const LOAN_GUIDE = [
  {
    source: `Microfinance Banks (LAPO, Accion, Finca, Addosser)`,
    range: `₦50,000 – ₦2,000,000`,
    how: `Walk into any MFB branch with your BVN, 2 passport photos, a guarantor, and a simple business plan. Most MFBs offer group loans (co-guarantor with 4–9 other traders) starting at ₦50k with NO collateral, stepping up to ₦1m–₦2m for individuals with a 6-month repayment track record. Interest is ~3–5% monthly. Disbursal in 2–7 days.`,
    best_for: `₦200k – ₦500k tier businesses, first-time borrowers, market traders.`,
  },
  {
    source: `Bank of Industry (BOI) — SME / NYIF / RNN`,
    range: `₦500,000 – ₦10,000,000`,
    how: `Apply online at boi.ng. Required: CAC registration (RC number), tax ID (TIN), BVN, audited/management accounts (or 6-month bank statements for micro), and a one-page business plan. BOI's MSME product starts at ₦500k single-digit interest (typically 5–9% flat). The Nigeria Youth Investment Fund (NYIF) under BOI/CBN gives ₦250k–₦3m to applicants 18–40. Processing: 4–8 weeks.`,
    best_for: `₦1m – ₦2m tier, registered businesses, youth 18–40.`,
  },
  {
    source: `CBN Agri-Business / Small & Medium Enterprises Development Scheme (AGSMEIS)`,
    range: `₦500,000 – ₦10,000,000`,
    how: `Apply through an approved Entrepreneurship Development Centre (EDC) or NIRSAL Microfinance Bank. Must complete a short EDC business-training course (free, 2–3 days), then submit BVN, CAC (if applicable), and a business plan. AGSMEIS lends at a single-digit rate (~9%) for agri, retail, and services. Up to 7 years tenor, 6-month moratorium.`,
    best_for: `Farming, poultry, fishery, food processing — ₦500k – ₦2m.`,
  },
  {
    source: `Commercial Bank SME Loans (Access, GTB, Zenith, Sterling SME)`,
    range: `₦1,000,000 – ₦50,000,000`,
    how: `Must have a business account with the bank for 6+ months showing consistent inflows, a 6-month statement, CAC, TIN, and collateral (land docs, vehicle, fixed deposit, or a guarantor) for unsecured tiers. Sterling's "I Woman" and Access's "W Power" require NO collateral for women in trade. Interest 18–28% per annum. Disbursal 1–3 weeks.`,
    best_for: `₦2m+ tier, businesses with trading history.`,
  },
  {
    source: `Cooperatives & Thrift Societies (market co-ops, staff co-ops)`,
    range: `₦50,000 – ₦1,000,000`,
    how: `Join a registered cooperative (most markets and offices have one). You contribute weekly/monthly (₦2k–₦10k). After 1–3 months you qualify for a loan 2–3× your savings at near-zero interest, repayable from your regular contributions. Zero collateral, zero paperwork. Fastest and cheapest source for micro capital.`,
    best_for: `₦200k tier, anyone with a steady small income.`,
  },
  {
    source: `Family, Friends & Soft Loans`,
    range: `₦50,000 – ₦1,000,000`,
    how: `Write a one-page proposal: how much, what for, expected monthly profit, and a repayment schedule (e.g., ₦20k/month). Offer a small interest (5–10% total) to make it respectful. Always sign a simple written agreement even with family — it protects the relationship.`,
    best_for: `Seed capital at any tier, especially the very first ₦100k–₦200k.`,
  },
  {
    source: `Crowd-funding & Savings Groups (Esusu / Ajo)`,
    range: `₦100,000 – ₦500,000`,
    how: `Form or join an Esusu/Ajo of 5–10 trusted people contributing ₦20k–₦50k monthly. Each member takes the full pot in rotation. Zero interest, zero collateral — pure pooled discipline. Many Nigerians fund a whole business from one Esusu cycle.`,
    best_for: `₦200k tier, disciplined savers.`,
  },
];

export const LOAN_CHECKLIST = [
  `BVN (Bank Verification Number) — get at any bank for free`,
  `NIN (National Identification Number)`,
  `CAC registration (₦10–15k for a sole-proprietor business name) — needed for BOI, CBN, and most commercial loans`,
  `Tax Identification Number (TIN) — free at any FIRS office`,
  `A one-page business plan (problem, solution, market, capital use, monthly profit, repayment)`,
  `6 months of bank statements showing inflow (for banks/BOI)`,
  `2 recent passport photographs`,
  `1–2 guarantors (for MFBs and cooperatives)`,
  `Utility bill / proof of address (NEPA bill, tenancy agreement)`,
];

export const TIERS = [
  {
    capital: `₦200,000`,
    summary: `Micro-start capital. Best for service & trade businesses you can run alone with little equipment. Target monthly profit: ₦40k–₦90k.`,
    businesses: [
      {
        name: `POS Agency Banking (Mobile Money)`,
        why: `Highest daily cash turnover for the smallest setup. You earn ₦100–₦400 per transaction; a busy spot does 100–300 transactions/day.`,
        capital_split: [
          [`POS terminal (Moniepoint/Opay/PalmPay agent kit)`, `₦10,000`],
          [`Opening float / working capital (the cash you pay out)`, `₦120,000`],
          [`Branded umbrella, banner & chair`, `₦15,000`],
          [`Phone + small power bank`, `₦30,000`],
          [`Transport & reserves`, `₦25,000`],
        ],
        production: [
          `Register as an agent with Moniepoint, Opay, or PalmPay (free; takes 1–2 days with BVN + NIN).`,
          `Secure a spot with foot traffic: market gate, motor park, student area, or in front of a busy shop (negotiate ₦3–5k/month or a % share with the landlord).`,
          `Load ₦120k float into the POS account from your bank.`,
          `Open 8am–8pm daily. Cash out withdrawals (you pay customer cash, they pay your float), transfers, bill payments (DSTv, NEPA, airtime).`,
          `Reconcile cash vs app balance every 2 hours to catch shortages instantly.`,
        ],
        marketing: [
          `Banner with your agent ID and the services offered (withdrawal, transfer, bill pay, airtime).`,
          `Tell market women and okada/tricycle riders — they carry cash and need instant transfers.`,
          `Offer a 5% better rate on airtime/data than bank apps to pull walk-ins.`,
        ],
        promotion: [
          `Loyalty: every 10th transfer free airtime worth ₦100.`,
          `WhatsApp broadcast to 50–100 regulars with your daily rate and operating hours.`,
          `Refer-and-earn: give ₦50 bonus for a customer who brings a new regular.`,
        ],
        consistency: [
          `Never run out of float — top up at 9am and 2pm. A dry POS loses customers permanently.`,
          `Keep a daily log book (date, transactions, charges, float, cash on hand).`,
          `Reinvest 100% of profit for the first 3 months to grow float to ₦300k+.`,
          `Trust is the product — never short a customer, even by ₦50.`,
        ],
        profit: `₦4,000–₦9,000/day profit = ₦120k–₦270k/month on ₦200k capital.`,
      },
      {
        name: `Mini Importation (Phone Accessories & Trinkets from China)`,
        why: `Buy at ₦200–₦1,000, sell at ₦2,000–₦6,000. Margins of 5–20×. Runs from a phone and a delivery rider.`,
        capital_split: [
          [`First stock order from 1688/Alibaba`, `₦120,000`],
          [`Shipping/freight (Chinese agent → Lagos, ~2 weeks)`, `₦25,000`],
          [`Packaging, branded thank-you cards`, `₦10,000`],
          [`Social media ads budget (₦1k/day)`, `₦20,000`],
          [`Reserves`, `₦25,000`],
        ],
        production: [
          `Register a free account on 1688.com or Alibaba (use a Nigerian freight agent like Chrisvicmall or a trusted Lagos agent for consolidation + shipping).`,
          `Order fast-movers: earphones, phone cases, chargers, smartwatches, waist trainers, ladies' jewelry/watches, power banks.`,
          `Confirm dimensions & weight with the agent before paying — shipping is by weight, not price.`,
          `Goods arrive Lagos in 2–3 weeks; pick up, photograph, and catalog each item.`,
        ],
        marketing: [
          `Instagram + TikTok + WhatsApp Business storefront with clear prices and 'delivery nationwide'.`,
          `Shoot 10–15 second vertical videos of each product — the algorithm sells.`,
          `Bundle deals: '3 cases + 1 earpiece ₦6,000' moves 3× the volume.`,
        ],
        promotion: [
          `₦1,000/day Facebook/Instagram ads targeted to Lagos/Abuja ages 18–34.`,
          `Influencer barter: gift 5 micro-influencers products for a shoutout (free).`,
          `Black Friday / payday promotions every last week of the month.`,
        ],
        consistency: [
          `Restock before stock hits 30% — never list an out-of-stock item.`,
          `Answer DMs within 10 minutes; speed wins impulse buyers.`,
          `Use a 3rd-party rider (Kwik, Gokada) or NIPSO logistics; charge ₦1,500–₦3,500 delivery.`,
          `Track profit per SKU weekly; drop anything below 3× margin.`,
        ],
        profit: `₦150k–₦400k/month once stock cycles 2–3 times.`,
      },
      {
        name: `Puff-Puff / Snacks & Small Chops Street Kiosk`,
        why: `Daily cash, zero spoilage if you sell out same day, ₦100–₦300 per pack with 70%+ margin.`,
        capital_split: [
          [`Frying setup (burner, big pot, sieve, umbrella)`, `₦30,000`],
          [`Display table & branded cooler`, `₦15,000`],
          [`First week ingredients (flour, sugar, oil, eggs, pepper)`, `₦40,000`],
          [`Packaging (nylon, takeaway plates, toothpicks)`, `₦15,000`],
          [`Branded banner & signage`, `₦20,000`],
          [`Reserves`, `₦80,000`],
        ],
        production: [
          `Master 3–4 products: classic puff-puff, peppered puff-puff, chicken pie, meat pie, spring rolls.`,
          `Prep batter at 5–6am; fry in two batches — morning rush (7–10am) and evening rush (4–7pm).`,
          `Keep a gas backup cylinder; a dead burner = lost day.`,
        ],
        marketing: [
          `Station near a school gate, motor park, or office building entrance.`,
          `Brand it: name, clean uniform, gloves, hairnet — hygiene sells in 2026 Nigeria.`,
          `Free first-day samples to the first 50 people; word-of-mouth does the rest.`,
        ],
        promotion: [
          `WhatsApp 'morning menu' broadcast to office workers who pre-order.`,
          `Friday party packs (5kg puff-puff + small chops for ₦8,000) for weekend events.`,
          `Loyalty card: buy 10 packs, get 1 free.`,
        ],
        consistency: [
          `Same taste, same portion, same spot, every single day — customers are creatures of habit.`,
          `Sell out by 7pm or donate leftovers; never fry yesterday's batter.`,
          `Bank ₦5k–₦10k daily; in 60 days you have ₦300k–₦600k to add chicken & chips.`,
        ],
        profit: `₦8k–₦20k/day = ₦240k–₦600k/month on ₦200k.`,
      },
      {
        name: `Mobile Barbing Salon`,
        why: `Skill-based, near-zero material cost per cut. ₦500–₦1,500 per cut, 8–20 cuts/day.`,
        capital_split: [
          [`Clipper + backup (Wahl/Andis)`, `₦45,000`],
          [`Mirror, cape, brush kit, blades, creams`, `₦25,000`],
          [`Small generator (I-pass-my-neighbor)`, `₦45,000`],
          [`Branded bag + banner`, `₦15,000`],
          [`First month consumables`, `₦20,000`],
          [`Reserves`, `₦50,000`],
        ],
        production: [
          `Pick a street-corner or compound gate with steady male foot traffic.`,
          `Open 6–9am and 4–8pm (the two rush windows).`,
          `Learn 3–4 styles cold: skin fade, low cut, afro, tribal mark.`,
          `Sanitize kit between every customer — a visible spray bottle builds trust.`,
        ],
        marketing: [
          `A clean, lit mirror and a '₦500 cut' banner beats a flashy shop.`,
          `Approach barbershop overflow — offer to take their walk-ins for ₦300.`,
        ],
        promotion: [
          `10-cuts loyalty card = 1 free.`,
          `WhatsApp 'I'm at your gate in 20 mins' home-service for ₦1,000–₦1,500.`,
        ],
        consistency: [
          `Be at the spot rain or shine at the same time — reliability is the brand.`,
          `Save ₦5k/day; in 4 months buy a second clipper and hire a boy for ₦2k/day.`,
        ],
        profit: `₦4k–₦15k/day = ₦120k–₦450k/month.`,
      },
    ],
  },
  {
    capital: `₦500,000`,
    summary: `Now you can add equipment, light inventory, and a small fixed spot. Target monthly profit: ₦100k–₦250k.`,
    businesses: [
      {
        name: `Smoked Catfish (Mini Fish Farm + Smoke)`,
        why: `Catfish sells itself in Lagos; smoked packs retail ₦3,000–₦6,000 and keep for 3 months.`,
        capital_split: [
          [`2–3 concrete/3000L tarpaulin ponds`, `₦120,000`],
          [`1,500 juvenile catfish (₦30 each)`, `₦45,000`],
          [`3 months feed (the biggest cost)`, `₦250,000`],
          [`Smoking kiln drums + charcoal + racks`, `₦45,000`],
          [`Water pump + test kit`, `₦20,000`],
          [`Reserves`, `₦20,000`],
        ],
        production: [
          `Source juveniles from a reputable hatchery; stock 500–750 fish per 3000L pond.`,
          `Feed 2× daily (morning + evening), flush 30% water weekly, monitor ammonia with a test kit.`,
          `Sort by size every 3 weeks to stop cannibalism.`,
          `Harvest at 4–5 months (500g–1kg). Smoke in a drum kiln for 8–12 hours.`,
          `Vacuum-pack or seal in branded nylon; shelf life 3 months unrefrigerated.`,
        ],
        marketing: [
          `Sell live at ₦1,200/kg to market women; smoked at ₦3,000–₦6,000/pack to supermarkets, restaurants, and online.`,
          `Approach 5–10 local bukas and supermarkets with free sample packs.`,
        ],
        promotion: [
          `Instagram/TikTok 'farm to your plate' videos of the smoking process sell premium.`,
          `WhatsApp pre-order: 'harvest this Friday, ₦2,500/pack, free delivery within Lagos'.`,
          `Easter, Christmas, Sallah hampers — your biggest quarter.`,
        ],
        consistency: [
          `Never skip a feed day — growth lost is profit lost.`,
          `Keep a mortality log; target <5% loss.`,
          `Rotate: stock a new batch every 6 weeks so you harvest monthly, not once a season.`,
        ],
        profit: `₦120k–₦300k per 5-month cycle; with rotation, ₦100k–₦200k/month steady.`,
      },
      {
        name: `Fashion Design (Tailoring / Ready-to-Wear)`,
        why: `A skill + one machine = a brand. Ready-to-wear tops sell ₦5k–₦25k with 50–70% margin.`,
        capital_split: [
          [`Industrial sewing machine (used Butterfly/Industrial)`, `₦150,000`],
          [`Overlock/serger machine`, `₦80,000`],
          [`Cutting table, scissors, tape, threads, fabrics stock`, `₦120,000`],
          [`Shop rent + fitting mirror + signage`, `₦80,000`],
          [`Instagram brand photoshoot`, `₦30,000`],
          [`Reserves`, `₦40,000`],
        ],
        production: [
          `Specialize in 2–3 silhouettes you can produce fast (e.g., kaftan, two-piece, boubou).`,
          `Cut in batches of 5–10 to reduce per-unit time.`,
          `Standardize your sizes (S/M/L) and finishing — quality is what justifies ₦15k+.`,
        ],
        marketing: [
          `Instagram + WhatsApp Business catalog with price on every piece.`,
          `Tailor Aso-ebi groups (10–50 outfits) for events — one order = one month's rent.`,
        ],
        promotion: [
          `Monthly 'ready-to-wear drop' on a fixed date; pre-orders get 10% off.`,
          `Free alteration for life on your own pieces — repeat buyers.`,
          `Influencer barter with 3–5 Lagos/Abuja micro-influencers per drop.`,
        ],
        consistency: [
          `Deliver on the promised date, every time. Late delivery kills a fashion brand.`,
          `Photograph every finished piece — it's both proof and content.`,
          `Bank 30% of every order; in 6 months buy a 2nd machine and hire a tailor.`,
        ],
        profit: `₦150k–₦400k/month once you run 30–50 orders/month.`,
      },
      {
        name: `Soap & Detergent Production (Home Care)`,
        why: `Recurring consumption (everyone washes weekly), ₦300–₦1,000 per litre/bottle, 60%+ margin.`,
        capital_split: [
          [`Caustic soda, soda ash, palm kernel oil, perfume, colorant (1-month stock)`, `₦150,000`],
          [`Mixing drums, molds, scale, stove`, `₦80,000`],
          [`Branded bottles, nylons, labels`, `₦80,000`],
          [`Small space (backyard is fine to start)`, `₦20,000`],
          [`First ad budget`, `₦50,000`],
          [`Reserves`, `₦120,000`],
        ],
        production: [
          `Learn 3 recipes: liquid soap (for dishes/floors), bar soap (laundry), and bleach.`,
          `Produce in 20–50 litre batches; cure bar soap 2 weeks before packaging.`,
          `Fill, label, and date-stamp every unit — supermarkets reject unlabeled stock.`,
        ],
        marketing: [
          `Wholesale to 10–20 neighborhood provision shops at ₦250–₦400/bottle; they retail ₦400–₦600.`,
          `Approach offices, schools, and salons for monthly supply contracts.`,
        ],
        promotion: [
          `WhatsApp reorder reminders every 3 weeks to each shop.`,
          `Branded jerrycan refills at a discount — locks in repeat buyers and saves packaging cost.`,
          `Free 500ml sample to every new shop to test demand.`,
        ],
        consistency: [
          `Same concentration and foam every batch — a weak batch loses a shop forever.`,
          `Keep stock records; never miss a shop's reorder day.`,
          `Reinvest profit into a bigger drum + 2nd product line (air freshener, disinfectant).`,
        ],
        profit: `₦100k–₦250k/month on ₦500k once 15–30 shops stock you.`,
      },
    ],
  },
  {
    capital: `₦1,000,000`,
    summary: `Real equipment, a small fixed shop, and brand-level marketing. Target monthly profit: ₦200k–₦500k.`,
    businesses: [
      {
        name: `Mini Poultry (300–500 Layers)`,
        why: `Eggs sell daily, recurring cash, ₦30–₦40 profit per egg, 300 layers = ~₦70k/week peak.`,
        capital_split: [
          [`Cage or deep-litter pen + drinkers/feeders (build or buy)`, `₦250,000`],
          [`500 point-of-lay pullets (16 weeks, ₦1,800 each)`, `₦180,000`],
          [`Layer feed for 3 months`, `₦320,000`],
          [`Vaccines, drugs, grit, calcium`, `₦50,000`],
          [`Generator + small freezer (for egg storage)`, `₦120,000`],
          [`Reserves`, `₦80,000`],
        ],
        production: [
          `Buy point-of-lay pullets (16 weeks) — they start laying in 2–4 weeks, skipping 4 months of feed cost.`,
          `Feed 110g/bird/day, fresh water always, 16 hours light/day (use bulbs at dawn/dusk).`,
          `Follow the full vaccination schedule (Newcastle, Gumboro, Fowl Pox).`,
          `Collect eggs twice daily; grade by size (small/medium/large).`,
          `Peak lay at ~80% by month 3; production lasts 12–18 months per batch.`,
        ],
        marketing: [
          `Wholesale crates to market women, shops, and bakers (₦4,500–₦5,000/crate).`,
          `Retail to compound customers at ₦70–₦100/egg.`,
          `Stale/broken eggs → sell to bakers at a discount, never waste.`,
        ],
        promotion: [
          `WhatsApp 'fresh eggs this morning' to a 100+ list at 6am.`,
          `Standing supply contract with 2–3 bakeries = predictable cash.`,
          `Branded egg trays with your farm name build recall.`,
        ],
        consistency: [
          `Biosecurity is everything: footbath, visitor limits, no other poultry nearby.`,
          `Daily mortality + production log; act on any drop >5% within 48 hours.`,
          `Restock point-of-lay birds 4 months before old batch declines — never have a gap.`,
        ],
        profit: `₦150k–₦350k/month steady; ₦2m–₦4m over an 18-month cycle.`,
      },
      {
        name: `Boutique / Female Clothing Store`,
        why: `Fast fashion turnover; buy ₦3k–₦8k in Lagos/Bali, sell ₦12k–₦35k.`,
        capital_split: [
          [`Shop rent + fit-out + rails + mirror + lighting`, `₦350,000`],
          [`First stock (Lagos/Yaba/Bali/Turkey bulk)`, `₦400,000`],
          [`Branded bags, hangers, receipt book`, `₦40,000`],
          [`Launch photoshoot + ads`, `₦80,000`],
          [`Reserves`, `₦130,000`],
        ],
        production: [
          `Source in bulk at Yaba/Balogun (Lagos), Trade Fair, or Bali/Turkey shopping trips.`,
          `Buy fast staples: corporate gowns, Ankara sets, party dresses, denims, quality basics.`,
          `Steam, tag, and price-tag every item before display.`,
          `Run a 3-week rotation: anything unsold after 21 days goes to a 'clearance rack' at ₦200 above cost.`,
        ],
        marketing: [
          `Instagram is the shop window — 3 posts/day, price in caption.`,
          `WhatsApp Business catalog synced with the shop.`,
        ],
        promotion: [
          `First-time customer 10% off + free delivery within Lagos.`,
          `Monthly 'restock day' event with snacks + try-ons = foot traffic.`,
          `Loyalty: spend ₦50k, get ₦5k off next purchase.`,
        ],
        consistency: [
          `Restock the 5 best sellers weekly — never let rails look empty.`,
          `Refund/exchange policy that's fair and fast — trust builds regulars.`,
          `Track sell-through % per category; double down on winners, cut losers.`,
        ],
        profit: `₦200k–₦500k/month at 40–60% margin once stock turns 1.5–2×/month.`,
      },
      {
        name: `Phone & Laptop Repair Shop`,
        why: `₦2,000–₦25,000 per repair, 5–15 jobs/day, recurring from the same customers.`,
        capital_split: [
          [`Shop/counter rent + fit-out`, `₦200,000`],
          [`Repair tools + microscope + heat gun + soldering station`, `₦250,000`],
          [`First parts stock (screens, batteries, charging ports)`, `₦300,000`],
          [`Branded signage + receipt book`, `₦30,000`],
          [`Reserves`, `₦220,000`],
        ],
        production: [
          `Master screen replacement, charging-port fix, battery swap, and software flashing.`,
          `Log every device in with a job card (name, fault, estimate, deposit, due date).`,
          `Test every repair 24 hours before handing back — a comeback job destroys trust.`,
        ],
        marketing: [
          `A clean, glass-fronted counter with prices posted beats a cramped stall.`,
          `Partner with 3–5 phone-accessory shops as referral points.`,
        ],
        promotion: [
          `WhatsApp 'repair status' updates with photos of the fix — customers love transparency.`,
          `30-day warranty on all repairs (your genuine edge over road-side repairers).`,
          `Free diagnostic; pay only if you approve the quote.`,
        ],
        consistency: [
          `Never over-promise a deadline; call ahead if a part is delayed.`,
          `Keep genuine vs grade-A parts clearly priced — never substitute secretly.`,
          `Reinvest in training: take 1 new skill (micro-soldering, data recovery) per quarter.`,
        ],
        profit: `₦200k–₦500k/month once you do 10–15 quality jobs/day.`,
      },
    ],
  },
  {
    capital: `₦2,000,000`,
    summary: `Now you can run a real small enterprise with staff and recurring contracts. Target monthly profit: ₦400k–₦1m.`,
    businesses: [
      {
        name: `Standard Poultry (Broilers + Layers Combo)`,
        why: `Two income streams: fast cash from broilers (6-week cycle) + steady cash from layers (eggs).`,
        capital_split: [
          [`Large pen + cages + biosecurity setup`, `₦600,000`],
          [`1,000 broiler chicks + 300 point-of-lay pullets`, `₦350,000`],
          [`Feed for 6 months (both batches)`, `₦700,000`],
          [`Drugs, vaccines, heating, feeders`, `₦100,000`],
          [`Generator + chest freezer`, `₦150,000`],
          [`Reserves`, `₦100,000`],
        ],
        production: [
          `Broilers: 1,000 every 6 weeks; sell at 2.5–3.5kg live weight to restaurants/frozen-food sellers.`,
          `Layers: 300 birds giving ~250 eggs/day from month 2; sell crates wholesale.`,
          `Strict vaccination + biosecurity; one disease outbreak can wipe a cycle.`,
          `Compost and sell spent manure to crop farmers — a side income.`,
        ],
        marketing: [
          `Broiler contracts with 3–5 restaurants / frozen-chicken brands (price locked per kg).`,
          `Eggs to bakeries + market women on standing supply.`,
        ],
        promotion: [
          `WhatsApp pre-order for 'fresh farm chicken' every harvest Thursday.`,
          `Branded packaging for retail eggs builds a customer-of-the-farm list.`,
        ],
        consistency: [
          `Daily records: feed consumed, eggs collected, mortality, water.`,
          `Rotate broiler batches so there's income every 6 weeks, not once a quarter.`,
          `Reinvest 40% of profit for year 1 to expand to 2,000 birds + a 2nd pen.`,
        ],
        profit: `₦400k–₦900k/month once both streams run on rotation.`,
      },
      {
        name: `Printing Press (T-shirts, Banners, Business Cards)`,
        why: `Every business, church, and event prints. ₦5k–₦50k per order, recurring.`,
        capital_split: [
          [`Heat-press + sublimation printer or DTF setup`, `₦700,000`],
          [`Computer + design software + cutter`, `₦250,000`],
          [`Shop rent + fit-out + display`, `₦400,000`],
          [`First stock (blanks, inks, transfer paper, card stock)`, `₦350,000`],
          [`Reserves`, `₦300,000`],
        ],
        production: [
          `Start with heat-transfer/sublimation (low entry) + a wide-format banner printer for banners.`,
          `Master 4 products cold: branded T-shirts, ID cards, business cards, event banners.`,
          `Standardize turnaround: T-shirts 48h, banners 24h, cards 72h.`,
        ],
        marketing: [
          `Walk every shop, church, school, and event planner within 2km with sample kits.`,
          `Bid for small corporate contracts (staff uniforms, conference materials).`,
        ],
        promotion: [
          `Bulk discounts: 100+ T-shirts get ₦200 off each — locks corporate jobs.`,
          `Free design service for orders above ₦50k — kills the 'I have no design' objection.`,
          `Christmas/Easter/Sallah branded merch drops for churches and companies.`,
        ],
        consistency: [
          `Never miss a promised date; printing is a deadline business.`,
          `Keep ink/paper buffer stock — a stock-out = lost order.`,
          `Photograph every job for a portfolio that sells the next one.`,
        ],
        profit: `₦400k–₦1m/month at 40–60% margin with 30–60 orders.`,
      },
      {
        name: `Restaurant / Buka (Local Eatery)`,
        why: `Daily cash, food is non-negotiable spend; ₦500–₦2,000 per plate, 100–400 plates/day.`,
        capital_split: [
          [`Shop rent + kitchen fit-out (cooker, pots, sinks)`, `₦600,000`],
          [`Tables, chairs, branded plates + utensils`, `₦350,000`],
          [`First week stock (rice, beans, proteins, palm oil, firewood/gas)`, `₦450,000`],
          [`Signage + branding + first ads`, `₦150,000`],
          [`Working capital + reserves`, `₦450,000`],
        ],
        production: [
          `Specialize in 5–7 dishes done excellently (jollof, amala+ewedu, eba+egusi, beans, plantain + egg, pepper soup, white rice + stew).`,
          `Cook in two batches: lunch peak (12–3pm) and evening (6–9pm).`,
          `Never reuse yesterday's stew — freshness is the reputation.`,
        ],
        marketing: [
          `Cleanliness + taste + speed, in that order. A spotless glass-front buka wins.`,
          `Office-worker delivery: WhatsApp menu at 11am, deliver by 1pm.`,
        ],
        promotion: [
          `'Buy 5 plates, 6th free' lunch card for the local workforce.`,
          `Friday special dish (asaro, pepper soup, or ofada rice) draws weekend crowds.`,
          `Partner with 3–5 offices for standing lunch contracts.`,
        ],
        consistency: [
          `Same recipe, same portion, same price every day — customers hate surprises.`,
          `Daily cash reconciliation; bank ₦20k–₦50k before touching profit.`,
          `Reinvest in a 2nd cooker + a server; a queue you can't clear loses the customer.`,
        ],
        profit: `₦400k–₦1m/month at 40–50% food cost once you serve 200–400 plates/day.`,
      },
    ],
  },
  {
    capital: `₦10,000,000`,
    summary: `Real machinery + a small team + recurring contracts. Target monthly profit: ₦1.5m–₦4m.`,
    businesses: [
      {
        name: `Sachet & Bottled Water Plant (Small Scale)`,
        why: `Everyone drinks water daily; a small line sells 5,000–20,000 sachets/day at ₦5–₦10 each.`,
        capital_split: [
          [`Water treatment + sachet/bottle machine (semi-auto)`, `₦5,500,000`],
          [`Borehole + tanks + piping + plumbing`, `₦1,500,000`],
          [`Nylon, preforms, caps + 1-month raw stock`, `₦800,000`],
          [`Generator (15–25kva) + electricals`, `₦900,000`],
          [`Shop/warehouse rent + fit-out`, `₦800,000`],
          [`Staff (3) + transport + reserves`, `₦500,000`],
        ],
        production: [
          `Register with NAFDAC and the state water corporation BEFORE you buy machines — the licence is the gate.`,
          `Drill a clean borehole, install sand + carbon + UV filtration, and run weekly lab tests.`,
          `Run two 8-hour shifts; one 400-sachet/min machine does ~20k bags/day.`,
          `Date-stamp and batch-code every pack; recall readiness is a NAFDAC requirement.`,
        ],
        marketing: [
          `Wholesale to 30–60 retailers at ₦100–₦120 per bag of 20; they retail ₦150–₦200.`,
          `Branded tricycle distribution for direct-to-kiosk supply.`,
        ],
        promotion: [
          `Free 1-bag sample to new shops; bulk discount at 100+ bags.`,
          `Events/parties/conferences supply contracts (chilled truck add-on later).`,
        ],
        consistency: [
          `Water quality is the brand — never skip a lab test even one week.`,
          `Maintain the machine weekly; a breakdown day costs ₦200k+ in lost sales.`,
          `Reinvest into a 2nd machine and a bottling line within 18 months.`,
        ],
        profit: `₦1.5m–₦4m/month at ~45% margin once you run 15k–20k sachets/day.`,
      },
      {
        name: `Used Car Dealership (Tokunbo)`,
        why: `Buy ₦2m–₦5m, sell ₦2.8m–₦7m; 3–6 cars in rotation = ₦1.5m–₦4m/month.`,
        capital_split: [
          [`First 3–4 tokunbo stock cars (Lagos/Cotonou auction)`, `₦7,000,000`],
          [`Lot rent + signage + lighting + security`, `₦800,000`],
          [`Mechanic inspection + minor repairs budget`, `₦700,000`],
          [`Paperwork: Customs duty verification, change-of-ownership`, `₦500,000`],
          [`Marketing + reserves`, `₦1,000,000`],
        ],
        production: [
          `Source from trusted auction agents in Cotonou or Lagos ports; verify Customs papers and VIN.`,
          `Run a full pre-sale inspection (engine, transmission, AC, tyres) — never sell a hidden fault.`,
          `Detail every car (wash, wax, interior) — presentation is 30% of the price.`,
        ],
        marketing: [
          `Facebook Marketplace + Instagram + Nairaland Auto + Jiji listings with clear photos & price.`,
          `Walk-in lot with posted prices and a "test-drive welcome" sign.`,
        ],
        promotion: [
          `"Buy-back guarantee" within 30 days builds buyer trust.`,
          `Financing partnerships with a microfinance bank so buyers can pay in installments.`,
        ],
        consistency: [
          `Never misrepresent a car's condition — one bad review kills a dealer's reputation.`,
          `Turn stock every 3–4 weeks; cars sitting 90 days lose value.`,
          `Reinvest profit to hold 8–10 cars at a time within a year.`,
        ],
        profit: `₦1.5m–₦4m/month turning 3–6 cars with ₦300k–₦1m margin each.`,
      },
    ],
  },
  {
    capital: `₦20,000,000`,
    summary: `Mid-size operations with staff, vehicles, and B2B contracts. Target monthly profit: ₦2.5m–₦7m.`,
    businesses: [
      {
        name: `Logistics / Delivery Fleet (Small)`,
        why: `E-commerce boom in Nigeria; per-delivery revenue ₦800–₦2,500; a 8-van fleet does 300+ drops/day.`,
        capital_split: [
          [`6–8 used delivery vans/buses (₦2.2m each)`, `₦14,000,000`],
          [`Branding + tracking devices`, `₦1,200,000`],
          [`Office/hub rent + dispatch software`, `₦1,500,000`],
          [`First month fuel + driver salaries (8)`, `₦1,800,000`],
          [`Reserves + insurance`, `₦1,500,000`],
        ],
        production: [
          `Fit each van with GPS; build a WhatsApp/SMS dispatch board.`,
          `Hire 8–10 drivers on ₦70k–₦120k + per-drop commission.`,
          `Partner with 3–5 e-commerce/retail brands for standing daily routes.`,
          `Maintain a strict service schedule; a broken van is idle capital.`,
        ],
        marketing: [
          `Direct B2B pitches to online sellers, pharmacies, and FMCG distributors.`,
          `Per-km transparent pricing beats opaque quotes.`,
        ],
        promotion: [
          `First-month discount to anchor clients who sign 6-month contracts.`,
          `Real-time delivery tracking link for every client's customer.`,
        ],
        consistency: [
          `Driver discipline + vehicle maintenance = uptime; both are daily tasks.`,
          `Track cost-per-delivery weekly; cut any route losing money.`,
        ],
        profit: `₦2.5m–₦7m/month once you run 250–400 daily drops.`,
      },
      {
        name: `Mini Event Center Rental`,
        why: `Recurring weekend income; ₦150k–₦500k per event, 4–8 events/month.`,
        capital_split: [
          [`Land lease or hall rent + fit-out (floor, paint, AC)`, `₦8,000,000`],
          [`Chairs, tables, drapes, stage, sound + lighting`, `₦6,000,000`],
          [`Generators (2) + security`, `₦2,500,000`],
          [`Marketing + reservations system`, `₦1,500,000`],
          [`Reserves`, `₦2,000,000`],
        ],
        production: [
          `Position for weddings, birthdays, and corporate meetings; flexible seating for 100–400.`,
          `Offer an all-in package (hall + chairs + tables + AC + sound + generator).`,
          `Keep a vetted vendor list (caterers, MCs, decorators) you earn referral fees from.`,
        ],
        marketing: [
          `Instagram + Google Business with real event photos every Monday.`,
          `Wedding planners and churches on retainer commissions.`,
        ],
        promotion: [
          `Off-peak (Mon–Thu) corporate-meeting discount to fill weekdays.`,
          `Free decoration add-on for bookings of 2+ consecutive events.`,
        ],
        consistency: [
          `Never double-book; a reservation error is a lawsuit.`,
          `Deep-clean + equipment check after every single event, no exceptions.`,
        ],
        profit: `₦2.5m–₦6m/month at 60–70% margin once you run 6–10 events/month.`,
      },
    ],
  },
  {
    capital: `₦50,000,000`,
    summary: `Asset-heavy business with staff, compliance, and contracts. Target monthly profit: ₦6m–₦15m.`,
    businesses: [
      {
        name: `Agro-Processing Plant (Cassava Garri / Palm Oil)`,
        why: `Value-add on raw farm output; garri sells ₦25k–₦45k/bag, palm oil ₦1,200–₦1,800/litre.`,
        capital_split: [
          [`Processing machinery (grater, press, fryer / mill)`, `₦22,000,000`],
          [`Land + factory shed + borehole`, `₦12,000,000`],
          [`Raw stock + logistics trucks`, `₦8,000,000`],
          [`NAFDAC + factory registration`, `₦2,000,000`],
          [`Staff (15) + reserves`, `₦6,000,000`],
        ],
        production: [
          `Secure a steady raw-supply contract with 50+ local farmers.`,
          `Run daily processing; bag and brand to NAFDAC spec.`,
          `Add a dryer for premium garri / a press line for palm oil.`,
        ],
        marketing: [
          `Wholesale to 50+ market unions and supermarkets nationwide.`,
          `Export-grade packaging opens the diaspora/African regional market.`,
        ],
        promotion: [
          `Branded 5kg/25kg bags with farm-direct story sell premium.`,
          `Co-op supply to boarding schools and institutions.`,
        ],
        consistency: [
          `Raw supply stability is the #1 risk — diversify across regions.`,
          `Never let quality slip one batch; a bad bag loses a whole market.`,
        ],
        profit: `₦6m–₦14m/month once you process 5–10 tons/day.`,
      },
      {
        name: `Boutique Hotel / Guest House (10 Rooms)`,
        why: `Recurring nightly income; ₦25k–₦80k/night/room, 60–80% occupancy in a good city.`,
        capital_split: [
          [`Building lease/buy + full renovation`, `₦28,000,000`],
          [`Furnishings, AC, beds, linens, smart TVs`, `₦9,000,000`],
          [`Reception + restaurant/kitchen fit-out`, `₦5,000,000`],
          [`Generators + inverters + water`, `₦4,000,000`],
          [`Staff (8) + marketing + reserves`, `₦4,000,000`],
        ],
        production: [
          `Position for business travelers and short-stay couples; fast Wi-Fi + 24/7 power is the product.`,
          `Run a 24-hour front desk, daily housekeeping, and a small breakfast bar.`,
          `Onboard to Booking.com, Agoda, and a direct WhatsApp booking line.`,
        ],
        marketing: [
          `Google Business + Instagram with real room photos + reviews.`,
          `Corporate accounts with 3–5 companies for staff transit stays.`,
        ],
        promotion: [
          `Weekend couple-stay packages; weekday corporate discounts.`,
          `Referral: 1 free night for every 10 bookings a guest brings.`,
        ],
        consistency: [
          `Power + cleanliness + quiet = repeat bookings; fail one and reviews tank.`,
          `Maintain a 4.5+ rating on every platform; respond to every review.`,
        ],
        profit: `₦6m–₦15m/month at 60%+ margin at 70% occupancy.`,
      },
    ],
  },
  {
    capital: `₦100,000,000`,
    summary: `Enterprise-grade operation with management, compliance, and infrastructure. Target monthly profit: ₦12m–₦30m.`,
    businesses: [
      {
        name: `Commercial Farming Estate (Poultry + Fish + Feed Mill)`,
        why: `Integrated farm cuts feed cost (the #1 expense) and supplies three income streams.`,
        capital_split: [
          [`Land (5–10 acres lease/purchase) + fencing`, `₦25,000,000`],
          [`Poultry houses (5,000 birds) + fish ponds + feed mill`, `₦40,000,000`],
          [`Starter stock + 6-month feed inputs`, `₦15,000,000`],
          [`Borehole + solar + cold storage + trucks`, `₦12,000,000`],
          [`Staff (25) + biosecurity + reserves`, `₦8,000,000`],
        ],
        production: [
          `Run poultry (eggs + broilers), catfish, and an on-site feed mill — feed mill profit doubles when you make your own feed.`,
          `Strict biosecurity, vaccination, and water management across all units.`,
          `Offtake contracts with 10+ off-takers (supermarkets, frozen-food brands, restaurants).`,
        ],
        marketing: [
          `B2B off-take contracts lock in price and volume.`,
          `Branded retail eggs + smoked fish for premium urban retail.`,
        ],
        promotion: [
          `Farm-tour videos + "fresh from our farm" branding sell premium.`,
          `Festive-season hampers (chicken + fish + eggs) boost Q4.`,
        ],
        consistency: [
          `One disease outbreak can erase a quarter — biosecurity is non-negotiable.`,
          `Daily records across every unit; weekly P&L by product line.`,
        ],
        profit: `₦12m–₦28m/month once all three streams run on rotation.`,
      },
      {
        name: `Real Estate: 6-Unit Mini-Flats (Rental Income)`,
        why: `Passive, inflation-proof rental income + asset appreciation.`,
        capital_split: [
          [`Land acquisition (good Lagos/Abuja location)`, `₦35,000,000`],
          [`Construction of 6 mini-flats (2-bedroom each)`, `₦45,000,000`],
          [`Finishing + fittings + borehole + generator`, `₦12,000,000`],
          [`Permits + legal + agent fees`, `₦4,000,000`],
          [`Reserves`, `₦4,000,000`],
        ],
        production: [
          `Build standard 2-bedroom mini-flats with prepaid meter, water, and parking each.`,
          `Rent at ₦700k–₦1.5m/year per unit depending on location.`,
          `Use a property manager for rent collection and maintenance.`,
        ],
        marketing: [
          `List on PropertyPro + Nairaland + local agents.`,
          `Sign long leases (1–2 years) to reduce turnover cost.`,
        ],
        promotion: [
          `First-year rent slightly below market fills all 6 units fast.`,
          `Refer-a-tenant bonus to existing tenants.`,
        ],
        consistency: [
          `Maintenance responsiveness keeps long-term tenants; ignored repairs = vacancies.`,
          `Screen tenants rigorously; one bad tenant costs more than a vacancy.`,
        ],
        profit: `₦5m–₦10m/year rent + ~10–15% annual capital appreciation.`,
      },
    ],
  },
  {
    capital: `₦200,000,000`,
    summary: `Mid-large enterprise with multiple revenue lines and management team. Target monthly profit: ₦25m–₦60m.`,
    businesses: [
      {
        name: `Neighborhood Shopping Complex (8–12 Shops)`,
        why: `Rental income from multiple tenants + anchor grocery unit drives footfall.`,
        capital_split: [
          [`Land + construction of complex`, `₦150,000,000`],
          [`Parking + security + finishing`, `₦25,000,000`],
          [`Anchor grocery/mini-mart fit-out`, `₦15,000,000`],
          [`Permits + legal + reserves`, `₦10,000,000`],
        ],
        production: [
          `Build 8–12 lockable shop units + one anchor mini-mart + adequate parking.`,
          `Mix tenants: pharmacy, boutique, restaurant, barber/salon, electronics, POS agent.`,
          `Run the anchor grocery yourself or lease it for premium rent.`,
        ],
        marketing: [
          `Lease via commercial agents + direct outreach to franchise brands.`,
          `Anchor grocery draws traffic that lifts every other shop's sales.`,
        ],
        promotion: [
          `Rent-free fit-out period (2–4 weeks) attracts quality tenants fast.`,
          `Branded complex with signage rights sold to tenants.`,
        ],
        consistency: [
          `Enforce a tenant mix that complements, not competes.`,
          `Monthly maintenance + security keeps the complex premium and fully let.`,
        ],
        profit: `₦2m–₦4m/month rent + anchor grocery profit; asset appreciates 10–15%/yr.`,
      },
      {
        name: `Standard Hotel (30 Rooms + Restaurant + Hall)`,
        why: `Recurring hospitality income + event-hall premium; ₦15k–₦60k/night + ₦300k–₦1m/event.`,
        capital_split: [
          [`Building + 30 rooms full furnish`, `₦130,000,000`],
          [`Restaurant + bar + event hall fit-out`, `₦30,000,000`],
          [`Power (big gen + inverter), water, AC`, `₦18,000,000`],
          [`Staff (30) + systems + reserves`, `₦22,000,000`],
        ],
        production: [
          `Full-service hotel: rooms, restaurant, bar, and a 200-seat event hall.`,
          `24/7 power and water, fast Wi-Fi, and security are the non-negotiables.`,
          `Hotel PMS software for bookings, billing, and occupancy tracking.`,
        ],
        marketing: [
          `Onboard to all OTAs (Booking, Agoda, Airbnb) + direct-booking discount.`,
          `Corporate accounts + wedding/event planners on commission.`,
        ],
        promotion: [
          `Weekday corporate + weekend event-hall packages fill the calendar.`,
          `Loyalty: 5th night free for repeat guests.`,
        ],
        consistency: [
          `Reviews drive occupancy; a single power/water failure tanks ratings.`,
          `Monthly staff training + a mystery-guest QA program keep standards.`,
        ],
        profit: `₦25m–₦55m/month at 60%+ occupancy with hall + restaurant.`,
      },
    ],
  },
  {
    capital: `₦500,000,000`,
    summary: `Corporate-scale operation with departments, compliance, and financing. Target monthly profit: ₦60m–₦150m.`,
    businesses: [
      {
        name: `Mixed-Use Real Estate Development (Flats + Retail)`,
        why: `Sell some units for cash recovery, retain others for rental cashflow + appreciation.`,
        capital_split: [
          [`Prime land acquisition`, `₦180,000,000`],
          [`Construction (residential + retail block)`, `₦230,000,000`],
          [`Finishing + infrastructure + parking`, `₦50,000,000`],
          [`Permits + marketing + reserves`, `₦40,000,000`],
        ],
        production: [
          `Develop a block of flats + ground-floor retail; sell 60% off-plan to fund completion.`,
          `Retain 40% for rental cashflow and long-term appreciation.`,
          `Use a reputable contractor + project manager with milestone payments.`,
        ],
        marketing: [
          `Off-plan sales with 3D renders + show apartment — sells 40% before completion.`,
          `Real-estate agents on commission across Lagos/Abuja/PH.`,
        ],
        promotion: [
          `Flexible payment plans (3–6 months) expand the buyer pool.`,
          `Brand the development; a named, gated complex sells premium.`,
        ],
        consistency: [
          `Deliver on the promised completion date — delays kill off-plan trust.`,
          `Quality finishing on the first units sets the brand for the rest.`,
        ],
        profit: `₦80m–₦200m one-time on sold units + ₦5m–₦12m/month rental on retained units.`,
      },
      {
        name: `Microfinance / Fintech Lending Company`,
        why: `Nigeria's credit gap is huge; lending at ~5% monthly earns ₦25m–₦60m/month on a ₦500m book.`,
        capital_split: [
          [`CBBN microfinance licence + compliance + CAC`, `₦40,000,000`],
          [`Core lending capital (loan book)`, `₦350,000,000`],
          [`Tech platform + app + scoring engine`, `₦50,000,000`],
          [`Offices + staff (40) + reserves`, `₦60,000,000`],
        ],
        production: [
          `Get a CBN unit/State MFB licence; build a loan-origination + collection app.`,
          `Lend to SMEs, traders, and salary earners with group/cooperative guarantees.`,
          `Use a credit-scoring model + BVN verification to cap default below 5%.`,
        ],
        marketing: [
          `Agent network across markets; digital onboarding via the app.`,
          `B2B payroll loans to companies with 50+ staff.`,
        ],
        promotion: [
          `First-loan fast approval builds a borrower-of-record base.`,
          `Lower rate for repeat borrowers with perfect repayment history.`,
        ],
        consistency: [
          `Default is the #1 risk — strict scoring + aggressive collection discipline daily.`,
          `Never lend above regulatory single-obligor limits.`,
        ],
        profit: `₦25m–₦60m/month net at ~5% monthly on a revolving ₦300m+ book.`,
      },
    ],
  },
  {
    capital: `₦1,000,000,000 (₦1 Billion)`,
    summary: `Group-level enterprise with subsidiaries, boards, and institutional financing. Target monthly profit: ₦120m–₦350m.`,
    businesses: [
      {
        name: `Industrial Park / Manufacturing Cluster`,
        why: `Multi-line manufacturing (food + packaging + light assembly) under one group cuts shared overhead.`,
        capital_split: [
          [`Land + industrial structures`, `₦400,000,000`],
          [`Multi-line machinery (food, packaging, assembly)`, `₦350,000,000`],
          [`Power (gas/solar hybrid) + logistics fleet`, `₦120,000,000`],
          [`Working capital + staff (200) + reserves`, `₦130,000,000`],
        ],
        production: [
          `Run 3–5 complementary lines (e.g., food processing, packaging, fast-moving consumer goods).`,
          `Share power, logistics, and admin across lines to cut unit cost.`,
          `ISO + NAFDAC + export certification to open regional markets.`,
        ],
        marketing: [
          `B2B distribution + supermarket chains + export off-takers.`,
          `Private-label manufacturing for other brands (high-margin, stable).`,
        ],
        promotion: [
          `Bulk supply contracts with FMCG majors and government feeding programs.`,
          `Made-in-Nigeria branding qualifies for import-substitution incentives.`,
        ],
        consistency: [
          `Downtime is the enemy — preventive maintenance + power redundancy are daily.`,
          `Quarterly board reviews; cut any line below target margin within 2 quarters.`,
        ],
        profit: `₦120m–₦300m/month across the lines at scale.`,
      },
      {
        name: `Hospitality Group (Hotel Chain, 3–4 Properties)`,
        why: `Multi-property group spreads risk and captures business + leisure + event markets.`,
        capital_split: [
          [`3–4 properties (acquire/lease + renovate)`, `₦600,000,000`],
          [`Furnishings + F&B + event halls across sites`, `₦180,000,000`],
          [`Central reservation + branding + tech`, `₦60,000,000`],
          [`Staff (300) + group ops + reserves`, `₦160,000,000`],
        ],
        production: [
          `Run a mix: 1 city business hotel, 1 leisure resort, 1–2 mid-range city hotels.`,
          `One central booking system + loyalty program + shared procurement.`,
          `Each property has a GM reporting to a group operations director.`,
        ],
        marketing: [
          `One group brand across all OTAs + corporate accounts nationwide.`,
          `Group loyalty: earn/ redeem nights across any property.`,
        ],
        promotion: [
          `Corporate negotiated rates for multi-site companies.`,
          `Leisure-resort packages + city-hotel weekday business rates.`,
        ],
        consistency: [
          `Group QA standards enforced monthly across all properties.`,
          `A single failing property drags the brand — fix or exit within a year.`,
        ],
        profit: `₦150m–₦350m/month at scale with diversified occupancy.`,
      },
    ],
  },
];