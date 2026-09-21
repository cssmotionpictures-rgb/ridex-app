import React from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

// Floating quick-actions button for the booking pages — one tap opens
// one-tap access to history and common support requests.
// items: [{ icon, label, to }] for links or [{ icon, label, onClick }] for actions.
export default function QuickActionsFab({ items, label = "Quick actions" }) {
  const [open, setOpen] = React.useState(false);

  const pillClass =
    "flex items-center gap-2 rounded-full border border-border/70 bg-card/95 backdrop-blur px-4 py-2.5 text-sm font-medium shadow-lg card-lift";

  return (
    <div className="fixed right-4 bottom-24 md:right-5 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="flex flex-col items-end gap-2 animate-fade-in">
          {items.map((it) =>
            it.to ? (
              <Link key={it.label} to={it.to} onClick={() => setOpen(false)} className={pillClass}>
                <it.icon className="w-4 h-4 text-primary" />
                {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                onClick={() => { setOpen(false); it.onClick?.(); }}
                className={pillClass}
              >
                <it.icon className="w-4 h-4 text-primary" />
                {it.label}
              </button>
            )
          )}
        </div>
      )}
      <button
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center active:scale-95"
      >
        <Plus className={`w-6 h-6 transition-transform duration-200 ${open ? "rotate-45" : ""}`} />
      </button>
    </div>
  );
}