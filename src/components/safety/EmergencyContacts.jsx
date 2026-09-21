import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Loader2 } from "lucide-react";

export default function EmergencyContacts() {
  const [contacts, setContacts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [rel, setRel] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const list = await base44.entities.EmergencyContact.list("-created_date", 50).catch(() => []);
    setContacts(list);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!name.trim() || !phone.trim()) return;
    setBusy(true);
    try {
      const c = await base44.entities.EmergencyContact.create({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        relationship: rel.trim(),
      });
      setContacts((p) => [c, ...p]);
      setName(""); setPhone(""); setEmail(""); setRel("");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    await base44.entities.EmergencyContact.delete(id).catch(() => {});
    setContacts((p) => p.filter((c) => c.id !== id));
  };

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
      <div>
        <h3 className="font-semibold">Emergency contacts</h3>
        <p className="text-xs text-muted-foreground mt-1">These people get an alert when you trigger SOS. Emails reach registered app users only.</p>
      </div>

      <div className="grid sm:grid-cols-4 gap-2">
        <div className="sm:col-span-1">
          <Label className="text-xs">Name</Label>
          <Input className="rounded-xl mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane" />
        </div>
        <div className="sm:col-span-1">
          <Label className="text-xs">Phone</Label>
          <Input className="rounded-xl mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803…" />
        </div>
        <div className="sm:col-span-1">
          <Label className="text-xs">Email</Label>
          <Input className="rounded-xl mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@…" />
        </div>
        <div className="sm:col-span-1">
          <Label className="text-xs">Relationship</Label>
          <Input className="rounded-xl mt-1" value={rel} onChange={(e) => setRel(e.target.value)} placeholder="Sister" />
        </div>
      </div>
      <Button className="rounded-full" onClick={add} disabled={busy || !name.trim() || !phone.trim()}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />} Add contact
      </Button>

      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && contacts.length === 0 && <p className="text-sm text-muted-foreground">No emergency contacts yet.</p>}
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-secondary/50 p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{c.name} <span className="text-muted-foreground">· {c.relationship || "contact"}</span></p>
              <p className="text-xs text-muted-foreground truncate">{c.phone}{c.email ? ` · ${c.email}` : ""}</p>
            </div>
            <a href={`tel:${c.phone}`} className="text-xs text-primary hover:underline">Call</a>
            <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}