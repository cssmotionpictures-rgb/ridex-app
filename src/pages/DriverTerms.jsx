import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Car, ShieldCheck } from "lucide-react";
import { CONTACT } from "@/lib/catalog";
import BackButton from "@/components/shared/BackButton";

const SECTIONS = [
  {
    h: "1. Independent Contractor Relationship",
    p: "By registering as a Driver on Ride X, you acknowledge and agree that you are an independent contractor and not an employee, agent, partner, or representative of CSS ENTERTAINMENT (RC 7573127), operator of the Ride X platform (\"Ride X\"). You retain sole control over the manner, means, and methods by which you perform services. You are responsible for determining when, where, and how long to work. Nothing in these Driver Terms creates an employment relationship. You are not entitled to any employment benefits, paid leave, minimum wage guarantees, or other entitlements of employment.",
  },
  {
    h: "2. Your Obligations",
    list: [
      "Maintain a valid driver's licence and vehicle registration at all times",
      "Maintain valid commercial or e-hailing insurance covering the services you provide",
      "Comply with all applicable traffic, transport, and regulatory laws",
      "Keep your vehicle in safe, roadworthy, and inspected condition",
      "Provide accurate, current information about yourself and your vehicle",
      "Use the Platform honestly and not engage in fraudulent activity",
    ],
  },
  {
    h: "3. Insurance Requirements",
    p: "You are solely responsible for maintaining valid commercial or e-hailing insurance coverage that applies to the transportation services you provide through the Platform. Personal auto insurance policies typically exclude commercial use and will not cover incidents during a ride. You must upload proof of valid insurance as part of onboarding and keep it current. Ride X may, at its discretion, verify your insurance status and suspend your access if coverage is invalid or expired. Ride X's insurance, if any, is contingent and secondary to your own policy.",
  },
  {
    h: "4. Background Checks & Continuous Monitoring",
    p: "As a condition of offering services, you consent to identity verification, criminal history screening, and driving record review before approval. You further consent to continuous monitoring and periodic re-screening. Ride X may disqualify or remove Drivers with disqualifying convictions, including violent felonies, sexual offences, stalking, or recent driving under the influence (DUI) convictions. Ride X reserves the right to suspend or remove any Driver based on background check results at its sole discretion.",
  },
  {
    h: "5. Conduct Standards",
    p: "You agree to conduct yourself professionally and lawfully at all times when providing services. You must not engage in violence, theft, verbal abuse, harassment, discrimination, dangerous behaviour, or fraud toward passengers, other Drivers, or Ride X staff. You are responsible for the safety and reasonable comfort of passengers during a ride. Reports of misconduct will be investigated and may result in suspension, blacklisting, or permanent removal from the Platform.",
  },
  {
    h: "6. Safety Features",
    p: "You agree to use the safety features provided by the Platform, including the Driver SOS button, ride PIN verification, incident reporting, and passenger ratings. You must not disable, tamper with, or circumvent any safety feature. You acknowledge that trip data, including GPS location and timestamps, may be recorded and retained for dispute resolution, safety, and legal compliance purposes.",
  },
  {
    h: "7. Account Suspension & Termination",
    p: "Ride X may suspend, restrict, or terminate your Driver account and access to the Platform at any time, with or without cause or notice, including for violations of these Driver Terms, safety incidents, regulatory requirements, or failure to maintain valid documents or insurance. You may stop using the Platform at any time. Upon termination, any pending earnings owed to you will be settled according to the Platform's payment terms.",
  },
  {
    h: "8. Payment & Commission",
    p: "You acknowledge that Ride X charges a commission on completed services, as communicated to you through the Platform. The commission rate and any applicable fees may be updated from time to time. Payments are settled to your registered bank account according to the Platform's payout cycle. You are responsible for any taxes applicable to your earnings as an independent contractor.",
  },
  {
    h: "9. Indemnification",
    p: "You agree to indemnify, defend, and hold harmless Ride X, its officers, directors, employees, and affiliates from any claims, damages, liabilities, losses, or expenses (including legal fees) arising out of your use of the Platform, your provision of services, your violation of these Driver Terms, your violation of any law, or any harm caused to a passenger, third party, or their property. This obligation survives termination of your account.",
  },
  {
    h: "10. Limitation of Liability",
    p: "To the maximum extent permitted by law, Ride X shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or relating to your use of the Platform. Ride X provides the Platform on an \"as is\" basis without warranties of any kind.",
  },
  {
    h: "11. Governing Law & Dispute Resolution",
    p: "These Driver Terms are governed by the laws of the Federal Republic of Nigeria. Any dispute shall first be resolved through good-faith negotiation, and if unresolved within thirty (30) days, submitted to arbitration in Lagos, Nigeria, in accordance with the Arbitration and Conciliation Act.",
  },
  { h: "12. Changes to These Terms", p: "Ride X may update these Driver Terms at any time. Updated Terms will be posted here with the revised date. Your continued use of the Platform after changes take effect constitutes acceptance of the updated Terms." },
];

export default function DriverTerms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/60 glass">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center gap-4">
          <BackButton fallback="/" label="Back" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" />
          <Link to="/" className="ml-auto font-heading font-extrabold text-lg">RIDE <span className="text-primary">X</span></Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-full bg-primary/10 p-2.5">
            <Car className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold">Driver Terms & Conditions</h1>
        </div>
        <p className="text-xs text-muted-foreground mb-8">Last Updated: August 8, 2026</p>

        <div className="rounded-3xl border border-primary/30 bg-primary/5 p-5 mb-8 flex gap-3">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">For Drivers only.</span> These Terms establish that you are an independent contractor, not an employee, and set out your insurance and conduct obligations.
          </p>
        </div>

        <div className="space-y-7">
          {SECTIONS.map((s, i) => (
            <section key={i}>
              <h2 className="text-lg font-semibold mb-2">{s.h}</h2>
              {s.p && <p className="text-sm text-muted-foreground leading-relaxed">{s.p}</p>}
              {s.list && (
                <ul className="space-y-1.5">
                  {s.list.map((li, k) => (
                    <li key={k} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-primary mt-0.5">•</span> {li}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section>
            <h2 className="text-lg font-semibold mb-2">13. Contact Us</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">For questions about the Driver Terms:</p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1">
              <li>Email: <a href={`mailto:${CONTACT.email}`} className="text-primary hover:underline">{CONTACT.email}</a></li>
              <li>Related: <Link to="/terms" className="text-primary hover:underline">User Terms & Conditions</Link> · <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link></li>
            </ul>
          </section>
        </div>

        <Link to="/" className="inline-flex items-center gap-2 mt-10 text-sm text-primary hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Ride X
        </Link>
      </main>
    </div>
  );
}