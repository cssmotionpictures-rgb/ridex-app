import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { Send, Loader2 } from "lucide-react";

// Admin dialog: reply to a curator's out-of-band response. Saves the reply on
// the CuratorSubmission AND attempts email delivery to the curator's address.
// Delivery only succeeds for registered app users OR on a paid plan with
// external email enabled — the result is shown honestly to the admin.
export default function ReplyToCuratorDialog({ open, submission, onClose, onSent }) {
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (open) {
      setMessage(submission?.curator_reply || "");
      setResult(null);
    }
  }, [open, submission]);

  const handleSend = async () => {
    if (!submission || !message.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("reply-to-curator", {
        submission_id: submission.id,
        message: message.trim(),
      });
      const data = res?.data || res;
      if (data?.delivery === "sent") {
        toast({ title: "Reply sent", description: `Delivered to ${data.curator_email}` });
      } else if (data?.delivery === "no_email") {
        toast({ title: "Reply saved", description: "Curator has no email on file — reply logged only.", variant: "destructive" });
      } else {
        toast({ title: "Reply saved, email failed", description: data?.delivery_error || "Email blocked (curator not a registered user / external email not enabled).", variant: "destructive" });
      }
      setResult(data);
      onSent?.();
      onClose();
    } catch (e) {
      toast({ title: "Failed to send reply", description: e?.message || "Please try again", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reply to curator</DialogTitle>
          <DialogDescription>
            {submission?.curator_name || "Curator"}
            {submission?.curator_id ? "" : " (no email on file)"}
            {" — "}
            {submission?.song_title || "submission"}
          </DialogDescription>
        </DialogHeader>

        {submission?.curator_reply && (
          <div className="rounded-xl border border-border/60 bg-secondary/40 p-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Their last response</p>
            <p className="whitespace-pre-wrap text-foreground/90">{submission.curator_reply}</p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="curator-reply-msg">Your reply</Label>
          <Textarea
            id="curator-reply-msg"
            rows={6}
            placeholder="Type your reply to the curator…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sending}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !message.trim()}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send & save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}