import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { CONTACT } from "@/lib/catalog";
import BackButton from "@/components/shared/BackButton";

const SECTIONS = [
  {
    h: "1. Introduction",
    p: "Welcome to Ride X (\"we,\" \"our,\" \"us\"). Ride X is a product/platform of CSS ENTERTAINMENT (RC 7573127), a company incorporated in Nigeria on June 11, 2024. We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website.",
  },
  {
    h: "2. Information We Collect",
    sub: [
      { t: "Personal Information", b: "We collect information you provide directly, including full name, email address, phone number, profile photo, and payment information (processed securely through Stripe and Paystack)." },
      { t: "Location Data", b: "We collect real-time location data when you use ride-hailing, logistics, and car wash services. This is required to match you with nearby drivers, track deliveries in real-time, and show venues near you." },
      { t: "Usage Data", b: "We automatically collect device information, IP address, app usage patterns, transaction history, and service bookings." },
    ],
  },
  {
    h: "3. How We Use Your Information",
    list: [
      "Provide and improve our services",
      "Process payments securely",
      "Match you with drivers and service providers",
      "Send booking confirmations and updates",
      "Respond to customer support inquiries",
      "Improve user experience",
      "Comply with legal obligations",
    ],
  },
  {
    h: "4. Data Sharing",
    p: "We share your information with drivers (name, pickup location, destination, contact details for ride completion), service providers (venue information, booking details), payment processors (Stripe and Paystack for secure payment processing), and legal authorities when required by law. We do not sell or rent your personal information to third parties.",
  },
  {
    h: "5. Data Storage & Security",
    p: "We implement reasonable security measures to protect your data, including encryption for sensitive data, secure servers, regular security reviews, and access controls.",
  },
  {
    h: "6. Data Retention",
    p: "We retain your information as long as your account is active or as needed to provide services. You may request deletion of your account and data at any time.",
  },
  {
    h: "7. Your Rights",
    list: [
      "Access your personal data",
      "Correct inaccurate data",
      "Delete your account and data",
      "Withdraw consent",
      "Opt-out of marketing communications",
    ],
  },
  { h: "8. Children's Privacy", p: "Ride X is not intended for children under 18. We do not knowingly collect data from children." },
  {
    h: "9. Third-Party Services",
    p: "We use trusted third-party service partners — including secure payment processing, mapping, and advertising services. These services have their own privacy policies.",
  },
  { h: "10. Changes to This Policy", p: "We may update this Privacy Policy. Changes will be posted here with the updated date." },
];

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/60 glass">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center gap-4">
          <BackButton fallback="/" label="Back" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" />
          <Link to="/" className="ml-auto font-heading font-extrabold text-lg">RIDE <span className="text-primary">X</span></Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-full bg-primary/10 p-2.5">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold">Privacy Policy</h1>
        </div>
        <p className="text-xs text-muted-foreground mb-8">Last Updated: August 7, 2026</p>

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
            <h2 className="text-lg font-semibold mb-2">11. Contact Us</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">For privacy questions or concerns:</p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1">
              <li>Email: <a href={`mailto:${CONTACT.email}`} className="text-primary hover:underline">{CONTACT.email}</a></li>
              <li>Website: <span className="text-foreground">{CONTACT.website}</span></li>
              <li>Response Time: Within 24 hours</li>
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