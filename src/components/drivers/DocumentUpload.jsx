import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Upload, CheckCircle2, FileText } from "lucide-react";

export default function DocumentUpload({ label, value, onChange, accept = "image/*,application/pdf" }) {
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);

  const handle = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onChange(file_url);
    } catch (e) {
      alert(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const isImage = value && /\.(jpg|jpeg|png|webp|gif)$/i.test(value);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full rounded-2xl border border-dashed border-border/70 bg-secondary/30 p-4 text-left flex items-center gap-3 hover:bg-secondary/50 transition disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">Uploading…</p>
            </div>
          </>
        ) : value ? (
          <>
            {isImage ? (
              <img src={value} alt={label} className="w-12 h-12 rounded-lg object-cover border border-border/60" />
            ) : (
              <FileText className="w-6 h-6 text-emerald-400" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{label}</p>
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Uploaded — tap to replace
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">Tap to upload</p>
            </div>
          </>
        )}
      </button>
    </div>
  );
}