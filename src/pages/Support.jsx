import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT } from "@/lib/catalog";
import { Mail, Globe, AtSign } from "lucide-react";
import AdBanner from "@/components/shared/AdBanner";
import FeedbackForm from "@/components/shared/FeedbackForm";

export default function Support() {
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [service, setService] = React.useState("general");
  const [email, setEmail] = React.useState("");
  const [tickets, setTickets] = React.useState([]);

  const load = () => base44.entities.SupportTicket.list("-created_date", 20).then(setTickets);
  React.useEffect(() => {
    load();
    base44.auth.me().then((u) => setEmail(u.email || "")).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    await base44.entities.SupportTicket.create({ subject, message, service, customer_email: email });
    setSubject("");
    setMessage("");
    load();
  };

  return (
    <div>
      <PageHeader eyebrow="Support" title="We're here to help" subtitle="Open a ticket and our team will get back to you." />

      {/* Non-critical screen banner — in-flow, never covers controls */}
      <div className="mb-6"><AdBanner /></div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <form onSubmit={submit} className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
          <div>
            <Label className="text-xs">Your email</Label>
            <Input className="rounded-xl mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="so we can reply" required />
          </div>
          <div>
            <Label className="text-xs">Subject</Label>
            <Input className="rounded-xl mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <Label className="text-xs">Which service?</Label>
            <select value={service} onChange={(e) => setService(e.target.value)} className="w-full rounded-xl mt-1 bg-input border border-input px-3 py-2 text-sm">
              <option value="general">General</option>
              <option value="ride">Ride X</option>
              <option value="logistics">Logistics X</option>
              <option value="equipment">CSS Constructions</option>
              <option value="carwash">Carwash X</option>
              <option value="venues">Vibe & Tap</option>
              <option value="movies">CSS Motion Pictures</option>
              <option value="music">RIDE X Sounds</option>
              <option value="aimaster">RIDE X Song Master</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">How can we help?</Label>
            <Textarea className="rounded-xl mt-1 min-h-32" value={message} onChange={(e) => setMessage(e.target.value)} required />
          </div>
          <Button type="submit" className="rounded-full w-full h-11 font-semibold">Submit ticket</Button>
        </form>

        <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4 h-fit">
          <h3 className="font-semibold">Reach us directly</h3>
          <p className="text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> {CONTACT.email}</p>
          <p className="text-sm flex items-center gap-2"><Globe className="w-4 h-4 text-primary" /> {CONTACT.website}</p>
          <p className="text-sm flex items-center gap-2"><AtSign className="w-4 h-4 text-primary" /> {CONTACT.social}</p>
        </div>
      </div>

      <div className="mt-10 max-w-2xl">
        <FeedbackForm />
      </div>

      <h3 className="font-semibold mt-10 mb-4">My tickets</h3>
      <div className="space-y-3">
        {tickets.length === 0 && <p className="text-sm text-muted-foreground">No tickets yet.</p>}
        {tickets.map((t) => (
          <div key={t.id} className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{t.subject}</p>
              <StatusBadge status={t.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t.message}</p>
            {t.admin_reply && <p className="text-sm mt-3 p-3 rounded-xl bg-secondary">RIDE X: {t.admin_reply}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}