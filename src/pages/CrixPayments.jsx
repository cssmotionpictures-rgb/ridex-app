import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import PaymentsDashboard from "@/components/crix/PaymentsDashboard";

export default function CrixPayments() {
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="CRIXCOIN · PAYMENTS"
        title={<span className="gold-text">Payments Dashboard</span>}
        subtitle="Every CRIXCOIN payment in one place — wallet balance, provider-filtered history and live transaction statuses, nothing hidden."
      />
      <PaymentsDashboard user={user} />
    </div>
  );
}