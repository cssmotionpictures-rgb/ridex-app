import React from "react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Download, SlidersHorizontal } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { MASTER_PRESETS } from "@/lib/aiMastering";

// The RIDE X mastering chain translated 1:1 into stock DAW plugins, so a
// producer can run the same master natively inside Logic / FL / Pro Tools on
// their 2-bus instead of uploading the final WAV here.
const UNIVERSAL_STEPS = [
  "Put the whole chain on your stereo output (2-bus), in this exact order — it IS the RIDE X chain.",
  "Sub & kick EQ → mud cut → presence → air → 7 kHz harshness tamer → saturation → punch comp → glue comp → limiter.",
  "Never compress the vocal/snare mid core on the 2-bus — the RIDE X engine leaves the mid band untouched, that's what keeps it open.",
  "Below 140 Hz, gently tighten with a slow-attack compressor (attack 15 ms) so the low end punches instead of wobbling.",
  "De-ess the top above 5.5 kHz lightly — ducks only the sharp 'twitter' moments, keeps the air silky.",
  "No reverb on the 2-bus — major-label masters stay dry and loud; space belongs in the mix, never on the master.",
  "Widen gently: lift the side (L−R) signal about +8%, mono core untouched. Master stays centered and punchy.",
  "Finish at −1 dB true peak — loud but streaming-safe, never clipping.",
];

const DAW_PLUGINS = [
  { daw: "Logic Pro", plugins: "Channel EQ → Compressor (punch) → Compressor (glue) → Adaptive Limiter (ceiling). Width: Direction Mixer (~62%). Harsh tamer: second Channel EQ band at 7 kHz." },
  { daw: "FL Studio", plugins: "Fruity Parametric EQ 2 (all bands + 7 kHz dip) → Fruity Compressor ×2 → Fruity Limiter. Width: Fruity Stereo Shaper (side +8%)." },
  { daw: "Pro Tools", plugins: "EQ III (all bands + 7 kHz dip) → D3 (punch) → D3 (glue) → Maxim (ceiling). Width: any M/S utility, side +8%." },
  { daw: "Any DAW", plugins: "Any parametric EQ → two compressors → one brickwall limiter set to the preset ceiling. That's all it takes." },
];

const fmtDb = (v) => `${v > 0 ? "+" : ""}${v} dB`;

const rowsFor = (p) => [
  ["Sub weight — low shelf", `${fmtDb(p.subGain)} @ ${p.subFreq} Hz`],
  ["Kick punch — peak", `${fmtDb(p.kickGain)} @ ${p.kickFreq} Hz · Q ${p.kickQ}`],
  ["Mud cut — peak", `${fmtDb(p.mudGain)} @ ${p.mudFreq} Hz · Q 1.1`],
  ["Presence — peak", `${fmtDb(p.presenceGain)} @ ${p.presenceFreq} Hz · Q 0.9`],
  ["Air — high shelf", `${fmtDb(p.airGain)} @ ${p.airFreq} Hz`],
  ["Harshness tamer — peak", "-2 dB @ 7000 Hz · Q 1.2 (go to -4 dB if the mix is sharp)"],
  ["Punch compressor", `Threshold ${p.punch.threshold} dB · ratio ${p.punch.ratio}:1 · attack ${Math.round(p.punch.attack * 1000)} ms · release ${Math.round(p.punch.release * 1000)} ms · knee ${p.punch.knee}`],
  ["Glue compressor", `Threshold ${p.glue.threshold} dB · ratio ${p.glue.ratio}:1 · attack ${Math.round(p.glue.attack * 1000)} ms · release ${Math.round(p.glue.release * 1000)} ms · soft knee`],
  ["Saturation drive", p.drive > 0 ? `Gentle console/tape drive at about ${(p.drive * 100).toFixed(0)}% — subtle, never smeary` : "None — keep this master clean"],
  ["Output ceiling", `${p.ceilingDb} dB true peak`],
];

export default function DawChainRecipe() {
  const { toast } = useToast();
  const [presetKey, setPresetKey] = React.useState("signature");
  const p = MASTER_PRESETS[presetKey] || MASTER_PRESETS.signature;

  const downloadRecipe = () => {
    try {
      const doc = new jsPDF();
      let y = 20;
      doc.setFontSize(16);
      doc.text(`RIDE X Song Master — Native DAW Chain (${p.label})`, 14, y);
      y += 10;
      doc.setFontSize(9);
      rowsFor(p).forEach(([label, val]) => {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.text(`${label}: ${val}`, 14, y);
        y += 5.5;
      });
      y += 4;
      doc.setFontSize(12);
      doc.text("How to run it", 14, y);
      y += 6;
      doc.setFontSize(9);
      UNIVERSAL_STEPS.forEach((s, i) => {
        const lines = doc.splitTextToSize(`${i + 1}. ${s}`, 180);
        lines.forEach((line) => {
          if (y > 275) { doc.addPage(); y = 20; }
          doc.text(line, 14, y);
          y += 5.5;
        });
      });
      y += 4;
      doc.setFontSize(12);
      doc.text("Stock plugins per DAW", 14, y);
      y += 6;
      doc.setFontSize(9);
      DAW_PLUGINS.forEach((d) => {
        const lines = doc.splitTextToSize(`${d.daw}: ${d.plugins}`, 180);
        lines.forEach((line) => {
          if (y > 275) { doc.addPage(); y = 20; }
          doc.text(line, 14, y);
          y += 5.5;
        });
      });
      doc.save(`RIDE X chain - ${p.label} (DAW settings).pdf`);
      toast({ title: "Chain settings downloaded", description: `RIDE X ${p.label} chain saved as a PDF.` });
    } catch {
      toast({ title: "Couldn't build the PDF", description: "Check your connection and try again." });
    }
  };

  return (
    <div className="rounded-3xl border border-primary/30 bg-secondary/40 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary"><SlidersHorizontal className="w-5 h-5" /><h3 className="font-semibold">Run the RIDE X chain inside your DAW</h3></div>
          <p className="text-xs text-muted-foreground mt-1">No plugin needed — dial these exact settings into your own stock plugins on the 2-bus and you're running the same master live in Logic, FL or Pro Tools.</p>
        </div>
        <Button size="sm" variant="outline" className="rounded-full shrink-0" onClick={downloadRecipe}>
          <Download className="w-4 h-4 mr-1" /> Settings PDF
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(MASTER_PRESETS).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPresetKey(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${key === presetKey ? "bg-primary text-primary-foreground border-primary" : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40"}`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
        {rowsFor(p).map(([label, val]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-border/40 py-1.5">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-medium">{val}</span>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-semibold mb-1.5">How to run it</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          {UNIVERSAL_STEPS.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {DAW_PLUGINS.map((d) => (
          <div key={d.daw} className="rounded-2xl bg-background/50 border border-border/50 p-3">
            <p className="text-xs font-semibold text-primary">{d.daw}</p>
            <p className="text-xs text-muted-foreground mt-1">{d.plugins}</p>
          </div>
        ))}
      </div>
    </div>
  );
}