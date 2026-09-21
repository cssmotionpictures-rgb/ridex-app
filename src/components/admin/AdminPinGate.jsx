import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, ShieldCheck } from "lucide-react";

const ADMIN_NAME = "cssnigltd";
const ADMIN_PIN = "739631";
const SESSION_KEY = "ridex_admin_unlocked";

export default function AdminPinGate({ children }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState(
    typeof sessionStorage !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "1"
  );

  const submit = (e) => {
    e.preventDefault();
    if (name.trim() === ADMIN_NAME && pin === ADMIN_PIN) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setUnlocked(true);
      setError("");
    } else {
      setError("Invalid admin name or PIN.");
    }
  };

  const lock = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setUnlocked(false);
    setName("");
    setPin("");
  };

  if (unlocked) {
    return (
      <div>
        <div className="flex justify-end mb-3">
          <Button size="sm" variant="outline" className="rounded-full" onClick={lock}>
            <Lock className="size-3.5" /> Lock admin
          </Button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-16">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-border/60 bg-card p-8 space-y-5">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="size-12 rounded-2xl bg-primary/15 flex items-center justify-center">
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold">Admin access</h2>
          <p className="text-xs text-muted-foreground">Enter your admin credentials to continue.</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Admin name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="cssnigltd" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">PIN</label>
            <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••" />
          </div>
        </div>
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <Button type="submit" className="w-full rounded-full">Unlock</Button>
      </form>
    </div>
  );
}