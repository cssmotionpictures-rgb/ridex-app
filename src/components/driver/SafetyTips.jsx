import React from "react";
import { ShieldCheck, AlertTriangle, Phone, MessageSquare, Siren, Users, Eye, Volume2 } from "lucide-react";

const TIPS = [
  { icon: AlertTriangle, title: "Stay calm and de-escalate", body: "Speak in a low, steady tone. Don't argue or match aggression. Apologize generally (\"I'm sorry this is frustrating\") to defuse tension without admitting fault." },
  { icon: Siren, title: "When to use the SOS button", body: "Any threat of violence, weapon, robbery attempt, or if a passenger refuses to exit. Press SOS — panic mode shares your location every 5 seconds with admin." },
  { icon: Eye, title: "Screen passengers before accepting", body: "Check the passenger's rating and verification status. Low ratings or unverified passengers carry higher risk — you may decline." },
  { icon: Phone, title: "Keep 112 ready", body: "The Nigerian emergency line is 112. After sending an in-app SOS, the call button appears immediately. Stay on the line and share your live location link." },
  { icon: MessageSquare, title: "Use in-app chat only", body: "Never share your personal phone number. Use the in-app chat — all messages are logged for your protection." },
  { icon: Users, title: "Drive flagged routes only", body: "Stick to the in-app navigation route. Long unplanned stops or detours trigger admin alerts and may mark the ride as suspicious." },
  { icon: Volume2, title: "Record during incidents", body: "Keep auto-audio recording on in your safety settings. Captured audio is encrypted and only used for incident investigations." },
  { icon: ShieldCheck, title: "Blacklist repeat offenders", body: "After a bad ride, add the passenger to your blacklist so you never get matched again. Admin reviews every entry for platform-wide flags." },
];

export default function SafetyTips() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Practical guidance to stay safe and handle difficult situations on the road.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {TIPS.map((t) => (
          <div key={t.title} className="rounded-2xl bg-secondary/40 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <t.icon className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold">{t.title}</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{t.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}