import React from "react";
import { CheckCircle2, FileWarning, Loader2, RefreshCw, XCircle } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/kala/Bits";
import { Button } from "@/components/ui/button";
import { readDisputeRows, approveDisputeRow, discardDisputeRow } from "@/lib/globalLearning/disputeReview";

const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " WAT"
    : "—";

// DISPUTE ROW REVIEW — instant per-row APPROVE / DISCARD for every ledger row
// still in dispute (status conflict | unverified). APPROVE confirms the row's
// recorded result as final (engine-graded, never a manual win/loss); DISCARD
// rejects the disputed evidence and cancels the row (counts toward nothing).
// Both actions re-read the row first and append an immutable admin-review note
// to its audit trail — evidence is never overwritten or deleted.
export default function DisputeRowReview({ isAdmin, me }) {
  const [state, setState] = React.useState("loading");
  const [rows, setRows] = React.useState([]);
  const [busyId, setBusyId] = React.useState(null);
  const [note, setNote] = React.useState(null);

  const load = React.useCallback(async () => {
    setState("loading");
    try {
      const { rows: disputeRows } = await readDisputeRows();
      setRows(disputeRows);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const act = async (row, fn) => {
    if (busyId) return;
    setBusyId(row.id);
    setNote(null);
    let res;
    try {
      res = await fn({ row, performedBy: me?.email || me?.id || "admin" });
    } catch (e) {
      res = { paused: true, message: `ACTION FAILED — ${String(e?.message || e)}. Nothing was changed.` };
    }
    setBusyId(null);
    setNote(res);
    await load();
  };

  return (
    <SectionCard
      title="DISPUTE ROW REVIEW — INSTANT APPROVE / DISCARD"
      icon={<FileWarning className="w-4 h-4 text-primary" />}
      sub="Every ledger row still in dispute (status CONFLICT or UNVERIFIED). APPROVE confirms the row's recorded result as final — engine-graded. DISCARD rejects the disputed evidence — the row is cancelled and counts toward nothing. Each action re-reads the row and appends an immutable admin-review note."
      right={
        <Button variant="outline" className="rounded-full h-7 px-3 text-[10px]" onClick={load} disabled={state === "loading"}>
          {state === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} REFRESH
        </Button>
      }
    >
      {state === "loading" && (
        <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading dispute rows…
        </p>
      )}
      {state === "error" && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-400/30 bg-rose-400/5 px-3 py-2">
          <p className="text-[11px] text-rose-200">Dispute read failed — retry shortly. Nothing was changed.</p>
          <Button variant="outline" className="rounded-full h-7 px-3 text-[10px]" onClick={load}>RETRY</Button>
        </div>
      )}

      {state === "ready" && (
        <>
          {!rows.length ? (
            <EmptyState>No dispute rows — every settled prediction carries a resolved result.</EmptyState>
          ) : (
            <div className="rounded-xl border border-border/60 divide-y divide-border/40">
              {rows.map((r) => (
                <div key={r.id} className="px-3 py-2 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px]">
                    <span className={`font-extrabold ${r.status === "conflict" ? "text-rose-300" : "text-amber-300"}`}>{r.status.toUpperCase()}</span>
                    <span className="font-bold text-[11px]">{r.home} vs {r.away}</span>
                    <span className="text-muted-foreground truncate max-w-[40%]">{r.league}</span>
                    <span className="text-muted-foreground">{r.market_label || r.market_key}</span>
                    {r.actual_home != null && (
                      <span className="font-bold">recorded {r.actual_home}–{r.actual_away}</span>
                    )}
                    <span className={r.verification === "verified_provider" ? "text-emerald-300" : "text-amber-300"}>{(r.verification || "none").toUpperCase()}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-muted-foreground truncate max-w-[55%]">{r.result_source || "no source"} · {fmt(r.settled_at)}</span>
                    {isAdmin ? (
                      <span className="ml-auto flex gap-1.5">
                        <Button
                          size="sm"
                          className="rounded-full text-[10px] h-7 px-3"
                          onClick={() => act(r, approveDisputeRow)}
                          disabled={busyId !== null}
                        >
                          {busyId === r.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />} APPROVE
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full text-[10px] h-7 px-3 border-rose-400/40 text-rose-300 hover:bg-rose-400/10"
                          onClick={() => act(r, discardDisputeRow)}
                          disabled={busyId !== null}
                        >
                          {busyId === r.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <XCircle className="w-3 h-3 mr-1" />} DISCARD
                        </Button>
                      </span>
                    ) : (
                      <span className="ml-auto text-[10px] text-muted-foreground">ADMIN ONLY</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {note && (
            <p className={`text-[10px] font-bold ${note.done ? "text-emerald-300" : note.skipped ? "text-amber-300" : "text-rose-300"}`}>
              {note.done
                ? `${note.action} APPLIED — row status is now ${note.status.toUpperCase()}; audit note appended, evidence preserved.`
                : note.message}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            APPROVE keeps the verification honest (user-supplied stays user-supplied — an admin confirmation is not a verified-provider
            result); DISCARD cancels the row so it counts toward nothing. Both append to the row's audit trail — nothing is overwritten.
          </p>
        </>
      )}
    </SectionCard>
  );
}