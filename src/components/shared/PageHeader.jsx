import React from "react";

export default function PageHeader({ eyebrow, title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2">{eyebrow}</p>}
        <h1 className="text-3xl md:text-4xl font-extrabold">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-2 max-w-xl">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}