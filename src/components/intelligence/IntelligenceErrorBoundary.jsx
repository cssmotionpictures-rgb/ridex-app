import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Local error boundary for the Prediction Intelligence screen. If ANY section
// of the learning dashboard crashes during render, the user sees an explicit
// "TEMPORARILY UNAVAILABLE" card with RETRY — never a blank page, and never a
// crash that unmounts the whole app shell. The learning engine and its data
// are untouched; only this screen's display failed.
export default class IntelligenceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[PredictionIntelligence]", error?.message || error, info?.componentStack || "");
  }

  retry = () => {
    this.setState({ error: null });
    this.props.onRetry?.(); // parent remounts the page → fresh data load
  };

  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || this.state.error);
      return (
        <div className="rounded-3xl border border-rose-500/30 bg-card/70 p-8 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
          <p className="text-sm font-extrabold">PREDICTION INTELLIGENCE TEMPORARILY UNAVAILABLE</p>
          <p className="text-xs text-muted-foreground">
            This screen hit a display error. The learning engine, the global ledger and every prediction section are untouched — no data was changed or lost.
          </p>
          <pre className="text-left text-[10px] font-mono text-muted-foreground break-words whitespace-pre-wrap bg-secondary/40 rounded-2xl p-3 max-h-40 overflow-auto">
            {msg}
          </pre>
          <Button onClick={this.retry} className="rounded-full font-bold">RETRY</Button>
        </div>
      );
    }
    return this.props.children;
  }
}