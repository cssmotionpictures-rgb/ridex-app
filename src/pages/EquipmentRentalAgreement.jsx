import React from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import { ShieldCheck } from "lucide-react";

const SECTIONS = [
  {
    n: 1,
    title: "Delivery and Possession",
    body: [
      "The Client acknowledges and agrees that upon delivery of the Caterpillar equipment (hereinafter referred to as “the Equipment”) to the Client or the Client’s designated representative, full and complete possession of the Equipment is transferred to the Client.",
      "From the moment of delivery until the Equipment is officially received and accepted back by CSS Construction/Ride X at its designated yard or location, the Client assumes full and sole responsibility for the Equipment. This responsibility includes, but is not limited to, security, safekeeping, and all acts or omissions of the Client’s employees, agents, contractors, or any third parties accessing the Equipment.",
    ],
  },
  {
    n: 2,
    title: "Vandalism, Robbery, and Security Responsibility",
    intro: "The Client SHALL:",
    list: [
      "Exercise the highest degree of care in protecting the Equipment from vandalism, robbery, theft, unauthorized access, and damage.",
      "Provide adequate and secure storage for the Equipment when it is not in operation. The Client agrees that it is solely responsible for ensuring the Equipment is stored in a secure, well-lit, and monitored location to prevent acts of vandalism, theft, and robbery.",
      "Take all reasonable precautions to prevent third parties from accessing or tampering with the Equipment. This includes securing the Equipment with approved locks, immobilizers, and GPS tracking systems (if provided) at all times when not in use.",
    ],
  },
  {
    n: 3,
    title: "Loss, Theft, Vandalism, or Damage",
    intro: "In the event of any loss, theft, vandalism, robbery, damage, or destruction of the Equipment for any reason, including but not limited to criminal acts, negligence, natural disasters, or site conditions:",
    list: [
      "Immediate Notification: The Client must notify CSS Construction/Ride X in writing and provide full details of the incident within 24 hours of occurrence. For theft, vandalism, or robbery, the Client must also immediately file an official police report with the relevant authorities and provide a copy to CSS Construction/Ride X.",
      "Full Financial Liability: The Client accepts full financial liability and SHALL compensate CSS Construction/Ride X for the full current market replacement value of the Equipment, as determined by CSS Construction/Ride X or its authorized representative. This applies regardless of whether the loss was caused by the Client’s negligence or the actions of a third party; whether insurance is available or if a claim is denied; and the Client’s financial circumstances at the time of the incident.",
      "No Depreciation: The Client agrees that depreciation, wear and tear, or pre-existing condition of the Equipment shall NOT be factored into the replacement value. The Client is responsible for the full cost of purchasing a brand-new replacement of the exact or equivalent make and model acceptable to CSS Construction/Ride X.",
    ],
  },
  {
    n: 4,
    title: "Insurance Requirements",
    list: [
      "Mandatory Insurance: Prior to taking possession of the Equipment, the Client must provide valid proof of the following minimum insurance coverages, naming CSS Construction/Ride X as an additional insured and loss payee — General Liability Insurance (minimum ₦50,000,000 per occurrence) and Physical Damage / Comprehensive Coverage for the full replacement value of the Equipment against theft, vandalism, robbery, fire, flood, and all other risks.",
      "Indemnification: The Client agrees to indemnify, defend, and hold harmless CSS Construction/Ride X, its affiliates, employees, and agents from and against any and all claims, losses, liabilities, damages, costs, or expenses (including reasonable legal fees) arising out of or related to the operation, possession, use, or maintenance of the Equipment while on rent to the Client.",
    ],
  },
  {
    n: 5,
    title: "Security Deposit",
    list: [
      "Mandatory Security Deposit: The Client must pay a refundable security deposit, the amount of which is determined by CSS Construction/Ride X based on the type, age, and value of the Equipment.",
      "Deduction of Costs: The security deposit may be used, in whole or in part, to cover outstanding rental fees, repair costs not covered by insurance, the full replacement value of the Equipment in the event of loss/theft/vandalism, and any other costs incurred by CSS Construction/Ride X as a result of the Client’s non-compliance.",
      "Non-Refundable: The security deposit is non-refundable if the Equipment is not returned in good working condition (normal wear and tear excepted), or if there is any damage, loss, theft, vandalism, or robbery.",
    ],
  },
  {
    n: 6,
    title: "Default and Remedies",
    intro: "In the event of default by the Client — including failure to pay rental fees, failure to return the Equipment on the agreed return date, misuse, neglect, vandalism, damage, failure to comply with any term of this Agreement, or where CSS Construction/Ride X in good faith believes the Equipment is at risk — CSS Construction/Ride X reserves all rights and remedies available at law or under this agreement. Without limiting the foregoing, CSS Construction/Ride X may, at its option:",
    list: [
      "Demand Immediate Return: Demand that the Client immediately deliver the Equipment to CSS Construction/Ride X’s premises at the Client’s expense.",
      "Repossess: Take immediate possession of the Equipment without further notice or demand.",
      "Terminate: Terminate this Agreement and any other agreements with the Client.",
      "Seek Damages: Pursue any legal or equitable remedy, including suing for damages, recovery of the Equipment’s full replacement value, and all costs and expenses (including legal fees) associated with the default.",
    ],
  },
];

const SUMMARY = [
  { icon: "🔒", label: "Full Responsibility for Equipment" },
  { icon: "🚨", label: "Vandalism Protection" },
  { icon: "🔫", label: "Robbery Protection" },
  { icon: "🛡️", label: "Security Requirements" },
  { icon: "💰", label: "Full Replacement Value Liability" },
  { icon: "📋", label: "Mandatory Insurance" },
  { icon: "💵", label: "Security Deposit" },
  { icon: "⚖️", label: "Indemnification" },
  { icon: "🏛️", label: "Default and Remedies" },
];

export default function EquipmentRentalAgreement() {
  return (
    <div>
      <PageHeader
        eyebrow="Legal · CSS Construction"
        title="Caterpillar Rental Agreement"
        subtitle="Client Responsibility & Protection Clause — establishes that the client assumes all risks once they take possession of the equipment."
      />

      <div className="rounded-3xl border border-primary/30 bg-primary/5 p-5 mb-8 flex gap-3">
        <ShieldCheck className="w-6 h-6 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          This agreement establishes that the <b className="text-foreground">client — not CSS Construction/Ride X</b> — is fully responsible for protecting the Caterpillar equipment once it leaves our control. By proceeding to hire, the Client accepts all terms below.
        </p>
      </div>

      <div className="space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.n} className="rounded-3xl border border-border/60 bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-9 h-9 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm shrink-0">{s.n}</span>
              <h2 className="text-lg font-bold">{s.title}</h2>
            </div>
            {s.body?.map((p, i) => (
              <p key={i} className="text-sm text-muted-foreground leading-relaxed mb-3">{p}</p>
            ))}
            {s.intro && <p className="text-sm text-muted-foreground leading-relaxed mb-3">{s.intro}</p>}
            {s.list && (
              <ol className="space-y-3">
                {s.list.map((item, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-6 h-6 rounded-full bg-secondary text-foreground font-semibold flex items-center justify-center text-xs shrink-0 mt-0.5">{i + 1}</span>
                    <span className="text-muted-foreground leading-relaxed">{item}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-3xl border border-border/60 bg-card p-6">
        <h2 className="text-lg font-bold mb-4">Client Responsibilities — Summary</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SUMMARY.map((row) => (
            <div key={row.label} className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3">
              <span className="text-xl">{row.icon}</span>
              <span className="text-sm font-medium">{row.label}</span>
              <span className="ml-auto text-primary">✓</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 flex justify-center">
        <Link to="/equipment" className="text-sm text-primary hover:underline">← Back to Caterpillar hire</Link>
      </div>
    </div>
  );
}