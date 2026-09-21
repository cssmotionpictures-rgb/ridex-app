import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// SECTION ERROR BOUNDARY — a crash inside one sports section (a malformed
// provider payload reaching render, a bad leg record…) takes down ONLY that
// section. Real Odds, Provider Status, Fixtures, Odds Movement and the board
// keep working, each inside its own boundary.

export default class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Section crashed (isolated by boundary):", error?.message || error, info?.componentStack || "");
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-5 text-center space-y-2.5">
          <AlertTriangle className="w-5 h-5 text-red-400 mx-auto" />
          <p className="text-sm font-bold text-red-400">Unable to load this section right now.</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            A data payload this section received could not be rendered safely. The rest of the page keeps working.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-secondary text-[11px] font-semibold hover:bg-secondary/70"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}