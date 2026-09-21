import React from "react";
import { FileAudio } from "lucide-react";

// Professional WAV export settings — the artist picks the sample rate and
// bit depth the finished master is delivered in (distributors & streamers
// accept 16/24-bit WAV anywhere from 44.1 kHz to 96 kHz).
const RATES = [
  { label: "44.1 kHz", value: 44100 },
  { label: "48 kHz", value: 48000 },
  { label: "88.2 kHz", value: 88200 },
  { label: "96 kHz", value: 96000 },
];

const DEPTHS = [
  { label: "16-bit", value: 16 },
  { label: "24-bit", value: 24 },
];

export default function ExportSettings({ sampleRate, bitDepth, onSampleRateChange, onBitDepthChange }) {
  const pill = (active) =>
    `px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40"
    }`;

  return (
    <div className="rounded-2xl bg-secondary/60 border border-border/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileAudio className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">Export settings</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Sample rate</p>
        <div className="flex flex-wrap gap-1.5">
          {RATES.map((r) => (
            <button key={r.value} type="button" className={pill(sampleRate === r.value)} onClick={() => onSampleRateChange(r.value)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Bit depth</p>
        <div className="flex flex-wrap gap-1.5">
          {DEPTHS.map((d) => (
            <button key={d.value} type="button" className={pill(bitDepth === d.value)} onClick={() => onBitDepthChange(d.value)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Pro distribution standard: 24-bit WAV at 44.1 kHz — accepted by Spotify, Apple Music, Boomplay and every major distributor.
      </p>
    </div>
  );
}