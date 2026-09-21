import React from "react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";

export default function AdminEntityTable({ rows, columns, actions = [], empty = "Nothing here yet." }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;

  return (
    <div className="rounded-3xl border border-border/60 bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-xs text-muted-foreground">
            {columns.map((c) => (
              <th key={c.key} className="text-left font-medium px-4 py-3 whitespace-nowrap">{c.label}</th>
            ))}
            {actions.length > 0 && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/40 last:border-0">
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-3 max-w-[240px] truncate">
                  {c.status ? <StatusBadge status={r[c.key]} /> : c.render ? c.render(r) : String(r[c.key] ?? "—")}
                </td>
              ))}
              {actions.length > 0 && (
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    {actions
                      .filter((a) => !a.visible || a.visible(r))
                      .map((a) => (
                        <Button key={a.label} size="sm" variant={a.variant || "outline"} className="rounded-full text-xs h-8" onClick={() => a.onClick(r)}>
                          {a.label}
                        </Button>
                      ))}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}