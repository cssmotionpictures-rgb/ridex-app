import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const E = base44.entities;

export default function AdminEditDialog({ open, onClose, entity, record, fields, onSaved }) {
  const [values, setValues] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (record) {
      const init = {};
      fields.forEach((f) => { init[f.key] = record[f.key] ?? (f.type === "boolean" ? false : f.type === "number" ? 0 : ""); });
      setValues(init);
      setError("");
    }
  }, [record, fields]);

  if (!record) return null;

  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = { ...values };
      fields.forEach((f) => {
        if (f.type === "number") payload[f.key] = Number(payload[f.key]) || 0;
      });
      await E[entity].update(record.id, payload);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {entity}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={f.key}>{f.label}</Label>
              {f.type === "boolean" ? (
                <div className="flex items-center gap-3 pt-1">
                  <Switch id={f.key} checked={!!values[f.key]} onCheckedChange={(v) => set(f.key, v)} />
                  <span className="text-sm text-muted-foreground">{values[f.key] ? "Yes" : "No"}</span>
                </div>
              ) : f.type === "textarea" ? (
                <Textarea id={f.key} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              ) : f.type === "select" ? (
                <Select value={values[f.key]} onValueChange={(v) => set(f.key, v)}>
                  <SelectTrigger><SelectValue placeholder={f.label} /></SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "doc" ? (
                values[f.key] ? (
                  /\.(jpg|jpeg|png|webp|gif)$/i.test(values[f.key]) ? (
                    <img src={values[f.key]} alt={f.label} className="w-full max-h-60 rounded-xl object-contain border border-border/60" />
                  ) : (
                    <a href={values[f.key]} target="_blank" rel="noreferrer" className="text-sm text-primary underline break-all">{values[f.key]}</a>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Not uploaded</p>
                )
              ) : (
                <Input id={f.key} type={f.type === "number" ? "number" : "text"} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}