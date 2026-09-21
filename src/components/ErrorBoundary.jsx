import React from "react";
import { Button } from "@/components/ui/button";

// Global recovery "back door": if any page throws during render, React would
// otherwise unmount the whole tree and leave #root empty (a dead black screen
// with no way to recover). This boundary catches the error, surfaces the
// message, and lets the user navigate back to safety without a full reload.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error?.message || error, info?.componentStack || "");
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 py-12">
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 max-w-md w-full">
            <p className="text-lg font-heading font-bold text-destructive mb-2">This screen hit an error</p>
            <p className="text-xs text-muted-foreground break-words mb-4 font-mono">{msg}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={() => { this.reset(); window.history.back(); }}>Go back</Button>
              <Button size="sm" onClick={() => { this.reset(); window.location.assign("/dashboard"); }}>Dashboard</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}