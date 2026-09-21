import React from "react";
import { MapPin, Clock, Wallet, Car } from "lucide-react";

const HIGHLIGHTS = [
  { icon: Car, label: "Rides & deliveries" },
  { icon: Wallet, label: "Escrow-protected" },
  { icon: MapPin, label: "Live tracking" },
  { icon: Clock, label: "24/7 support" },
];

const SERVICES_PREVIEW = [
  "Ride X", "Logistics X", "CSS Constructions", "Vibe & Tap", "Carwash X",
  "CSS Motion Pictures", "Live Sports", "RIDE X Sounds", "Marketplace", "Book Talent",
];

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen app-bg-template">
      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Brand / marketing panel */}
        <aside className="hero-mesh relative lg:w-1/2 lg:min-h-screen flex flex-col justify-between gap-8 p-7 sm:p-12 lg:p-16 border-b lg:border-b-0 lg:border-r border-border/40 overflow-hidden">
          <div className="relative z-10 flex items-center gap-2 font-heading font-extrabold text-2xl tracking-tight">
            RIDE <span className="text-primary">X</span>
          </div>

          <div className="relative z-10">
            <p className="text-xs uppercase tracking-[0.35em] text-primary mb-4">One app · 27+ services</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-[1.05]">
              Move, build, dine &amp;<br />
              <span className="gold-text">stream</span> — all in one app.
            </h2>
            <p className="text-muted-foreground mt-5 max-w-md text-sm sm:text-base">
              Rides, parcels, heavy equipment, dining, car wash, movies, sports, music, marketplace and more — all in one premium platform.
            </p>
            <div className="hidden sm:flex mt-7 flex-wrap gap-2 max-w-md">
              {SERVICES_PREVIEW.map((s) => (
                <span key={s} className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-border/60 bg-card/60 text-muted-foreground">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl">
            {HIGHLIGHTS.map((h) => (
              <div key={h.label} className="flex items-center gap-2 text-sm">
                <span className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <h.icon className="w-4 h-4" />
                </span>
                <span className="text-muted-foreground text-xs sm:text-sm">{h.label}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Form panel */}
        <main className="flex-1 flex items-center justify-center px-4 py-10 sm:py-16">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
                <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
              {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
            </div>
            <div className="bg-card rounded-2xl shadow-sm border border-border p-7 sm:p-8">
              {children}
            </div>
            {footer && <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>}
          </div>
        </main>
      </div>
    </div>
  );
}