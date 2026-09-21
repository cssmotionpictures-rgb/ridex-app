import React from "react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Download, Music4 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import DawChainRecipe from "@/components/studio/DawChainRecipe";

const DAW_GUIDES = [
  {
    name: "Logic Pro",
    steps: [
      "In Logic, go to File > Export > Song to Audio File and choose WAV, 24-bit (this is your mixdown).",
      "Upload that WAV here, pick your preset and master it.",
      "Download the finished .wav from this page.",
      "Drag the mastered .wav from your Downloads straight back into your Logic project or arrange window.",
    ],
  },
  {
    name: "FL Studio",
    steps: [
      "In FL Studio, go to File > Export > Wave file and render your mix as a WAV.",
      "Upload that WAV here and master it with any preset.",
      "Download the finished .wav from this page.",
      "Drag the mastered .wav into FL Studio's Playlist or Channel Rack — it lands as an audio clip ready to use.",
    ],
  },
  {
    name: "Pro Tools",
    steps: [
      "In Pro Tools, go to File > Bounce to Disk and export your mix as an interleaved WAV.",
      "Upload that WAV here and master it.",
      "Download the finished .wav from this page.",
      "Back in Pro Tools, use File > Import > Audio and drop the master onto a new track, or drag it from the Workspace browser.",
    ],
  },
  {
    name: "Any other DAW",
    steps: [
      "Export/bounce your finished mix as a WAV (not MP3) so no quality is lost.",
      "Upload it here, master it, and download the finished .wav.",
      "Import the mastered file into your DAW — it's a normal audio file every DAW accepts.",
    ],
  },
];

export default function DawWorkflowGuide() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState("Logic Pro");

  const downloadPdf = () => {
    try {
      const doc = new jsPDF();
      let y = 20;
      doc.setFontSize(18);
      doc.text("RIDE X Song Master — DAW Export Guide", 14, y);
      y += 8;
      doc.setFontSize(10);
      doc.text("Move your finished master into Logic Pro, FL Studio, Pro Tools or any DAW.", 14, y);
      y += 10;
      DAW_GUIDES.forEach((g) => {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(13);
        doc.text(g.name, 14, y);
        y += 6;
        doc.setFontSize(10);
        g.steps.forEach((s, i) => {
          const lines = doc.splitTextToSize(`${i + 1}. ${s}`, 180);
          lines.forEach((line) => {
            if (y > 275) { doc.addPage(); y = 20; }
            doc.text(line, 14, y);
            y += 5.5;
          });
        });
        y += 5;
      });
      doc.save("RIDE X Song Master - DAW Guide.pdf");
      toast({ title: "Guide downloaded", description: "RIDE X Song Master - DAW Guide.pdf saved to your device." });
    } catch {
      toast({ title: "Couldn't build the PDF", description: "Check your connection and try again." });
    }
  };

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary"><Music4 className="w-5 h-5" /><h3 className="font-semibold">Use your master in Logic, FL Studio, Pro Tools & more</h3></div>
          <p className="text-xs text-muted-foreground mt-1">A finished master is a standard .wav file — every DAW imports it. Here's the full round trip.</p>
        </div>
        <Button size="sm" variant="outline" className="rounded-full shrink-0" onClick={downloadPdf}>
          <Download className="w-4 h-4 mr-1" /> Guide PDF
        </Button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {DAW_GUIDES.map((g) => {
          const isOpen = open === g.name;
          return (
            <button
              key={g.name}
              type="button"
              onClick={() => setOpen(isOpen ? "" : g.name)}
              className={`text-left rounded-2xl border px-4 py-3 transition-colors ${isOpen ? "border-primary/60 bg-secondary" : "border-border/60 bg-secondary/40 hover:border-primary/40"}`}
            >
              <p className="text-sm font-semibold">{g.name}</p>
              {isOpen && (
                <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
                  {g.steps.map((s) => <li key={s}>{s}</li>)}
                </ol>
              )}
              {!isOpen && <p className="mt-1 text-xs text-muted-foreground">Tap to see the {g.name} steps</p>}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Tip: always master from a WAV mixdown, not an MP3 — you keep the full quality of your mix.</p>
      <DawChainRecipe />
    </div>
  );
}