import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Scale } from "lucide-react";
import { CONTACT } from "@/lib/catalog";
import BackButton from "@/components/shared/BackButton";

const SECTIONS = [
  {
    h: "1. Agreement to Terms",
    p: "These Terms and Conditions (\"Terms\") constitute a legally binding agreement (the \"Agreement\") between you (\"User,\" \"you,\" or \"your\") and CSS ENTERTAINMENT (RC 7573127), a company incorporated in Nigeria on June 11, 2024, operating the Ride X platform (\"Ride X,\" \"we,\" \"our,\" or \"us\"), governing your access to and use of the Ride X mobile application, website, and all related services. Ride X is a product/platform of CSS ENTERTAINMENT. By creating an account, booking a ride, or using any Ride X service, you acknowledge that you have read, understood, and agree to be bound by these Terms. If you do not agree, you must not use the Platform.",
  },
  {
    h: "2. Description of Service",
    p: "Ride X is a technology platform that connects Users with independent third-party service providers (\"Drivers\") offering ride-hailing, logistics, equipment rental, car wash, venue discovery, marketplace, and entertainment services. Ride X is a technology intermediary and does not itself provide transportation, delivery, or any other service. The Platform facilitates connections between Users and independent service providers.",
  },
  {
    h: "3. User Accounts & Eligibility",
    p: "You must be at least 18 years old and legally capable of entering into binding contracts to use the Platform. You agree to provide accurate, current, and complete information during registration and to keep your account information updated. You are responsible for safeguarding your password and for all activity conducted under your account.",
  },
  {
    h: "4. Independent Contractor Relationship",
    p: "Drivers and other service providers using the Platform are independent contractors, not employees, agents, or representatives of Ride X. Ride X does not direct or control the manner, means, or method by which Drivers perform services. Nothing in these Terms creates any employment, partnership, agency, or joint venture relationship between you and Ride X, or between Drivers and Ride X.",
  },
  {
    h: "5. Limitation of Liability",
    sub: [
      { t: "Cap on Liability", b: "To the maximum extent permitted by applicable law, Ride X, its officers, directors, employees, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, income, data, or goodwill, arising out of or related to your use of the Platform. Ride X's total aggregate liability for any claim arising from or relating to the Agreement shall not exceed the greater of (a) the amount you paid Ride X for the service giving rise to the claim in the three (3) months preceding the event, or (b) Fifty Thousand Naira (₦50,000)." },
      { t: "Services Provided \"As-Is\"", b: "The Platform and all services are provided on an \"as is\" and \"as available\" basis without warranties of any kind, whether express or implied. Ride X does not warrant that the Platform will be uninterrupted, error-free, secure, or that any Driver will complete a requested service." },
      { t: "No Warranty of Driver Conduct", b: "Ride X does not guarantee the suitability, reliability, or conduct of any Driver or service provider. While Ride X implements background checks and verification, Users acknowledge that Ride X cannot guarantee the actions of third-party Drivers." },
    ],
  },
  {
    h: "6. Assumption of Risk",
    p: "You acknowledge that using ride-hailing, logistics, and related services involves inherent risks, including but not limited to traffic accidents, injury, property damage, and interactions with third parties. You voluntarily and expressly assume all risks associated with using the Platform, whether or not caused by the negligence of Ride X, its Drivers, or other Users.",
  },
  {
    h: "7. Indemnification",
    p: "You agree to indemnify, defend, and hold harmless Ride X, its officers, directors, employees, and affiliates from and against any claims, damages, liabilities, losses, costs, or expenses (including reasonable legal fees) arising out of or relating to: (a) your use of the Platform; (b) your violation of these Terms; (c) your violation of any law or third-party rights; or (d) any dispute between you and a Driver or other User. This indemnification obligation survives termination of your account.",
  },
  {
    h: "8. Driver Screening & Background Checks",
    p: "Ride X requires Drivers to submit to identity verification, document review (driver's licence, vehicle registration, proof of insurance, and inspection), and background screening before being approved to offer services. Ride X may conduct continuous monitoring and periodic re-screening. However, Ride X makes no representation or warranty that such screening will identify all disqualifying conduct, and Users acknowledge that background checks have inherent limitations.",
  },
  {
    h: "9. Insurance",
    p: "Drivers are required to maintain valid commercial or e-hailing insurance coverage applicable to the services they provide. Ride X may, but is not obligated to, maintain contingent liability coverage. Users are encouraged to maintain their own personal insurance. Ride X's insurance coverage, if any, is secondary and subject to the terms of the applicable policy. Nothing in these Terms guarantees that insurance coverage will apply in any particular circumstance.",
  },
  {
    h: "10. Payments",
    p: "Payments for services are processed securely by Ride X. You authorize Ride X to charge your selected payment method for the full amount of any service booked, including applicable fees, tolls, and taxes. All amounts are billed in Nigerian Naira (₦) unless otherwise stated. Refunds, where applicable, are subject to Ride X's refund policy.",
  },
  {
    h: "11. Prohibited Conduct",
    list: [
      "Using the Platform for any unlawful purpose",
      "Harassing, threatening, or assaulting Drivers or other Users",
      "Providing false or misleading information",
      "Attempting to circumvent Platform payment systems",
      "Tampering with or disabling Platform safety features",
      "Failing to comply with a Driver's reasonable requests during a ride",
    ],
  },
  {
    h: "12. Safety Features",
    p: "The Platform provides safety features including an Emergency SOS button, ride PIN verification, emergency contact sharing, incident reporting, and driver/passenger ratings. You acknowledge these features are provided to enhance safety but do not guarantee safety or eliminate risk. Ride X is not liable for the failure of any safety feature to prevent harm.",
  },
  {
    h: "13. Intellectual Property",
    p: "The Platform, including its content, design, software, trademarks, and branding, is the property of Ride X and is protected by intellectual property laws. You may not copy, modify, distribute, or create derivative works from the Platform without our prior written consent.",
  },
  {
    h: "14. Governing Law & Dispute Resolution",
    p: "These Terms shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria, without regard to conflict-of-law principles. Any dispute arising from or relating to the Agreement shall first be attempted to be resolved through good-faith negotiation. If unresolved within thirty (30) days, the dispute shall be submitted to arbitration in Lagos, Nigeria, in accordance with the Arbitration and Conciliation Act. The courts of Nigeria shall have exclusive jurisdiction over any matters not subject to arbitration.",
  },
  {
    h: "15. Termination",
    p: "Ride X may suspend or terminate your access to the Platform at any time, with or without cause or notice, including if you violate these Terms or pose a risk to the safety of other Users or Drivers. Upon termination, all provisions of these Terms that by their nature should survive termination shall remain in effect, including indemnification, limitation of liability, and governing law.",
  },
  { h: "16. Changes to These Terms", p: "Ride X may modify these Terms at any time. We will post the updated Terms here with the revised date. Your continued use of the Platform after changes take effect constitutes acceptance of the updated Terms." },
];

export default function Terms() {
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
            <Scale className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold">Terms & Conditions</h1>
        </div>
        <p className="text-xs text-muted-foreground mb-8">Last Updated: August 8, 2026</p>

        <div className="rounded-3xl border border-primary/30 bg-primary/5 p-5 mb-8 flex gap-3">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">Please read carefully.</span> These Terms include a limitation of liability, an assumption of risk, and an indemnification clause. By using Ride X, you agree to be bound by them.
          </p>
        </div>

        <div className="space-y-7">
          {SECTIONS.map((s, i) => (
            <section key={i}>
              <h2 className="text-lg font-semibold mb-2">{s.h}</h2>
              {s.p && <p className="text-sm text-muted-foreground leading-relaxed">{s.p}</p>}
              {s.sub?.map((c, j) => (
                <div key={j} className="mb-3">
                  <p className="text-sm font-medium">{c.t}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">{c.b}</p>
                </div>
              ))}
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
            <h2 className="text-lg font-semibold mb-2">17. Contact Us</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">For questions about these Terms:</p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1">
              <li>Email: <a href={`mailto:${CONTACT.email}`} className="text-primary hover:underline">{CONTACT.email}</a></li>
              <li>Website: <span className="text-foreground">{CONTACT.website}</span></li>
              <li>Related: <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> · <Link to="/driver-terms" className="text-primary hover:underline">Driver Terms</Link></li>
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