import React from "react";
import { Outlet } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, LogOut } from "lucide-react";

// ADMIN-ONLY GATE — the deployment, gas-treasury, RPC and launch-control
// screens are the owner's internal tooling. A non-admin account is never
// silently bounced — it is told plainly which account is signed in and why
// the panel did not open, so a wrong-account login is never mistaken for a
// broken page.
export default function AdminRoute() {
  const [user, setUser] = React.useState(undefined); // undefined = loading, null = not signed in
  React.useEffect(() => {
    base44.auth.me().then((u) => setUser(u || null)).catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || (user.role || "") !== "admin") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-sm w-full rounded-xl border border-primary/30 bg-card/70 p-5 text-center">
          <ShieldAlert className="w-8 h-8 text-primary mx-auto" />
          <p className="font-display font-bold mt-3">Owner-only area</p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            You are signed in as{" "}
            <span className="text-foreground font-semibold break-all">{user ? user.email : "no account"}</span>
            {user ? <> — this account does not have owner access, so the launch panel will not open here.</> : <> — sign in to continue.</>}
          </p>
          <p className="text-[10px] text-muted-foreground mt-2">Sign out, then sign in with your admin account (the one that owns this app) and reopen the link.</p>
          <button
            onClick={() => base44.auth.logout("/login").catch(() => { window.location.href = "/login"; })}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground font-display font-bold px-4 py-2 text-xs"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}