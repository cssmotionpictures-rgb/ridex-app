import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// History-aware back button — NEVER leaves the app or forces a reload.
// If the user has an in-app history stack it goes one step back; if the page
// was opened directly (deep link, email link, gateway redirect) it falls
// back to a safe in-app destination instead of dropping the user out of
// the app or hiding the button entirely.
export default function BackButton({ fallback = "/dashboard", label, className }) {
  const navigate = useNavigate();
  const location = useLocation();

  const goBack = () => {
    if (location.key && location.key !== "default") navigate(-1);
    else navigate(fallback);
  };

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back"
      title="Back"
      className={className || "p-1.5 rounded-full hover:bg-secondary text-muted-foreground transition-colors"}
    >
      <ArrowLeft className={label ? "w-4 h-4" : "w-5 h-5"} />
      {label ? <span>{label}</span> : null}
    </button>
  );
}