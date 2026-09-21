import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function PaymentSuccess() {
  const params = new URLSearchParams(window.location.search);
  const service = params.get("service") || "";
  const ref = params.get("ref") || "";
  const nav = useNavigate();

  const next =
    service === "ride" ? `/ride-tracking?id=${ref}` :
    service === "logistics" ? `/delivery-tracking?id=${ref}` :
    service === "movie" ? `/movie?id=${ref}` :
    service === "subscription" ? `/sports` :
    service === "arcade" ? `/game` :
    "/dashboard";

  React.useEffect(() => {
    if (service === "arcade") {
      const plan = ref.includes("yearly") ? "yearly" : "monthly";
      const days = plan === "yearly" ? 365 : 30;
      localStorage.setItem("arcade_sub", JSON.stringify({ plan, exp: Date.now() + days * 86400000 }));
    }
  }, []);

  // Flutterwave redirect return (3DS): verify the order at the gateway and
  // settle the pending transaction, then issue the receipt.
  React.useEffect(() => {
    const flwTx = params.get("flw_tx");
    if (!flwTx) return;
    (async () => {
      try {
        const v = await base44.functions.invoke("flutterwave-pay", {
          action: "settleByTx",
          transaction_id: flwTx,
        });
        let paid = !!v?.data?.paid;
        if (!paid && params.get("tx_ref")) {
          // Hosted Flutterwave checkout return — the charge is re-verified at
          // the provider before anything is marked paid.
          try {
            const h = await base44.functions.invoke("flutterwave-checkout", {
              action: "settle",
              transaction_id: flwTx,
              tx_ref: params.get("tx_ref"),
            });
            paid = !!h?.data?.paid;
          } catch {}
        }
        if (paid) {
          try { await base44.functions.invoke("create-invoice", { transaction_id: flwTx }); } catch {}
        }
      } catch {}
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md text-center space-y-5">
        <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
        <h1 className="text-2xl font-bold">Payment successful</h1>
        <p className="text-muted-foreground">
          Your payment was confirmed and your {service || "order"} is being processed.
        </p>
        <Button className="rounded-full" onClick={() => nav(next)}>Continue</Button>
        <div>
          <Link to="/dashboard" className="text-sm text-muted-foreground underline">Back to dashboard</Link>
        </div>
      </div>
    </div>
  );
}