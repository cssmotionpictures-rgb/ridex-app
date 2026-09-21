import React from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ShareButton({ type, id, title, variant = "ghost", size = "icon", className = "", children }) {
  const url = `${window.location.origin}/preview/${type}/${id}`;

  const share = async () => {
    const data = { title: title || "RIDE X", text: `Watch ${title || "this"} on RIDE X — first 45 seconds free.`, url };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Preview link copied — share it anywhere!");
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Preview link copied — share it anywhere!");
      } catch {}
    }
  };

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={share} title="Share preview link">
      {children || <Share2 className="size-4" />}
    </Button>
  );
}