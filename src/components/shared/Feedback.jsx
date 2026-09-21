import React from "react";
import { Button } from "@/components/ui/button";
import { Inbox, AlertTriangle } from "lucide-react";

export function EmptyState({ icon: Icon = Inbox, title = "Nothing here yet", message, action }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="rounded-full bg-secondary p-4 mb-3">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="font-semibold">{title}</p>
      {message && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{message}</p>}
      {action}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden animate-pulse">
      <div className="aspect-square bg-secondary" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-2/3 rounded bg-secondary" />
        <div className="h-3 w-1/3 rounded bg-secondary" />
        <div className="h-8 w-full rounded-full bg-secondary mt-2" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 8 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="rounded-full bg-destructive/10 p-4 mb-3">
        <AlertTriangle className="w-6 h-6 text-destructive" />
      </div>
      <p className="font-semibold text-destructive">Something went wrong</p>
      {message && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{message}</p>}
      {onRetry && <Button variant="outline" size="sm" className="rounded-full mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}