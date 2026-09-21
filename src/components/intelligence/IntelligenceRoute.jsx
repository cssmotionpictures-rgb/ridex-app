import React from "react";
import { Loader2, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PredictionIntelligence from "@/pages/PredictionIntelligence";
import IntelligenceErrorBoundary from "./IntelligenceErrorBoundary";

// Route wrapper for the Global Learning Engine: ADMIN-ONLY internal surface.
// Ordinary customers never reach it — their results live in Results & History.
// A local error boundary keeps any crash to an honest "TEMPORARILY
// UNAVAILABLE + RETRY" card instead of a blank page, and RETRY remounts the
// page fresh (a full, clean data reload).
export default function IntelligenceRoute() {
  const [attempt, setAttempt] = React.useState(0);
  const [role, setRole] = React.useState("loading");
  React.useEffect(() => {
    base44.auth.me()
      .then((u) => setRole(String(u?.role || "").toLowerCase()))
      .catch(() => setRole("user"));
  }, []);
  const retry = () => setAttempt((a) => a + 1);
  if (role === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }
  if (role !== "admin") {
    return (
      <div className="rounded-3xl border border-border/60 bg-card/70 p-10 text-center space-y-3">
        <Lock className="w-8 h-8 text-muted-foreground mx-auto" />
        <p className="text-sm font-bold">THIS AREA IS NOT PART OF THE RIDE X EXPERIENCE</p>
        <p className="text-xs text-muted-foreground">Your results and history live in RESULTS.</p>
      </div>
    );
  }
  return (
    <IntelligenceErrorBoundary onRetry={retry}>
      <PredictionIntelligence key={attempt} />
    </IntelligenceErrorBoundary>
  );
}