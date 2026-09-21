import React from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Star, Loader2, MessageSquareHeart } from "lucide-react";

const CATEGORIES = [
  { id: "ride", label: "Ride X" },
  { id: "logistics", label: "Logistics X" },
  { id: "crix", label: "CRIXCOIN" },
  { id: "movies", label: "Movies & TV" },
  { id: "music", label: "Music" },
  { id: "carwash", label: "Carwash X" },
  { id: "equipment", label: "CSS Constructions" },
  { id: "other", label: "Something else" },
];

// Product feedback form — sends the user's rating and message straight to the
// owner's email so Ride X improves from real input.
export default function FeedbackForm() {
  const { toast } = useToast();
  const [rating, setRating] = React.useState(0);
  const [category, setCategory] = React.useState("ride");
  const [message, setMessage] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    base44.auth.me().then((u) => setEmail(u?.email || "")).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("send-feedback", {
        rating, category, message, contact_email: email,
      });
      if (!res?.data?.ok) throw new Error(res?.data?.error || "Could not send feedback");
      setDone(true);
      setRating(0);
      setMessage("");
      toast({
        title: "Feedback sent ✓",
        description: res.data.email_sent
          ? "Thank you — it landed straight in our inbox."
          : "Thank you — we saved your feedback.",
      });
    } catch (err) {
      toast({ title: "Could not send feedback", description: err.message, variant: "destructive" });
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquareHeart className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Help us improve Ride X</h3>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Tell us what to build, fix or change — your feedback goes straight to the founder.
      </p>

      <div>
        <Label className="text-xs">How is your experience so far?</Label>
        <div className="flex gap-1.5 mt-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={n + " star" + (n > 1 ? "s" : "")}
              className="rounded-lg p-1.5 border border-border bg-secondary/40 min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <Star className={"w-6 h-6 " + (n <= rating ? "text-primary fill-primary" : "text-muted-foreground")} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs">What is your feedback about?</Label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-xl mt-1 bg-input border border-input px-3 py-2.5 text-sm min-h-[40px]"
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <Label className="text-xs">Your feedback</Label>
        <Textarea
          className="rounded-xl mt-1 min-h-28"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What should we improve? What do you love? What's broken?"
          required
        />
      </div>

      <div>
        <Label className="text-xs">Your email (optional — so we can reply)</Label>
        <Input className="rounded-xl mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <Button type="submit" disabled={busy || rating < 1 || message.trim().length < 10} className="rounded-full w-full h-11 font-semibold">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send feedback"}
      </Button>

      {done && (
        <p className="text-sm text-emerald-400 text-center">Thank you! Your feedback was sent to the Ride X team.</p>
      )}
    </form>
  );
}