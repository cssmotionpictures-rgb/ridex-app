import React from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate, Link } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Car, CheckCircle2, Loader2, ShieldCheck, Lock, LogIn, X } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import DocumentUpload from "@/components/drivers/DocumentUpload";

const VEHICLE_TYPES = ["economy", "comfort", "xl", "bike", "van", "truck"];

const REQUIRED_DOCS = [
  { key: "profile_photo_url", label: "Profile photo" },
  { key: "driver_license_url", label: "Driver's licence" },
  { key: "vehicle_registration_url", label: "Vehicle registration papers" },
  { key: "insurance_url", label: "Proof of insurance" },
  { key: "inspection_url", label: "Vehicle inspection document" },
  { key: "id_document_url", label: "Means of identification" },
];

export default function DriverSignup() {
  const nav = useNavigate();
  const [me, setMe] = React.useState(null); // null=loading, false=not logged in, object=logged in
  const [driver, setDriver] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [showOtp, setShowOtp] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [form, setForm] = React.useState({
    full_name: "", phone: "", email: "", password: "", confirm_password: "",
    vehicle_type: "economy", license_plate: "", vehicle_color: "", driver_license: "",
    profile_photo_url: "", driver_license_url: "", vehicle_registration_url: "",
    insurance_url: "", inspection_url: "", id_document_url: "",
    bank_name: "", bank_account_name: "", bank_account_number: "",
  });

  React.useEffect(() => {
    base44.auth.me().then(async (u) => {
      setMe(u);
      const list = await base44.entities.Driver.filter({ created_by_id: u.id }).catch(() => []);
      if (list.length) setDriver(list[0]);
      setForm((f) => ({ ...f, full_name: u.full_name || "", email: u.email || "" }));
    }).catch(() => setMe(false));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setDoc = (k) => (url) => setForm((f) => ({ ...f, [k]: url }));

  const createDriverRecord = async () => {
    const { password, confirm_password, ...driverData } = form;
    return base44.entities.Driver.create({
      ...driverData,
      is_approved: false,
      is_online: false,
      terms_accepted: true,
      terms_accepted_date: new Date().toISOString(),
      background_check_status: "not_started",
      insurance_status: form.insurance_url ? "pending" : "pending",
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!termsAccepted) { setError("Please accept the Driver Terms to continue"); return; }
    if (me === false) {
      if (form.password.length < 6) { setError("Password must be at least 6 characters"); return; }
      if (form.password !== form.confirm_password) { setError("Passwords do not match"); return; }
      setBusy(true);
      try {
        await base44.auth.register({ email: form.email, password: form.password });
        setShowOtp(true);
      } catch (err) {
        setError(err.message || "Registration failed");
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      setDriver(await createDriverRecord());
    } catch (err) {
      setError(err.message || "Could not submit");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setError("");
    setBusy(true);
    try {
      const result = await base44.auth.verifyOtp({ email: form.email, otpCode });
      if (result?.access_token) base44.auth.setToken(result.access_token);
      setDriver(await createDriverRecord());
    } catch (err) {
      setError(err.message || "Invalid verification code");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await base44.auth.resendOtp(form.email);
      toast({ title: "Code sent", description: "Check your email for the new code." });
    } catch (err) {
      setError(err.message || "Failed to resend code");
    }
  };

  if (me === null) return <p className="text-muted-foreground">Loading…</p>;

  if (showOtp && !driver) {
    return (
      <div>
        <PageHeader eyebrow="Verify your email" title="Enter the code" subtitle={`We sent a 6-digit code to ${form.email}`} />
        <div className="max-w-md rounded-3xl border border-border/60 bg-card p-8 space-y-4">
          {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button className="rounded-full w-full h-11" onClick={verifyOtp} disabled={busy || otpCode.length < 6}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & finish sign-up"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Didn't receive the code?{" "}
            <button type="button" onClick={resend} className="text-primary font-medium hover:underline">Resend</button>
          </p>
        </div>
      </div>
    );
  }

  if (driver) {
    return (
      <div>
        <PageHeader eyebrow="Driver onboarding" title="You're on the team" subtitle="Your driver profile is set up. We'll notify you once an admin approves it." />
        <div className="max-w-md rounded-3xl border border-border/60 bg-card p-8 text-center space-y-4">
          <ShieldCheck className="w-14 h-14 text-primary mx-auto" />
          <p className="font-semibold text-lg">{driver.full_name}</p>
          <p className="text-sm text-muted-foreground">{driver.license_plate} · {driver.vehicle_type}</p>
          {driver.is_approved ? (
            <>
              <p className="text-emerald-400 flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /> Approved — you're ready to drive</p>
              <Button className="rounded-full w-full" onClick={() => nav("/driver-app")}>Open driver app</Button>
            </>
          ) : (
            <>
              <div className="text-left rounded-2xl bg-secondary/40 p-4 space-y-1.5 mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Documents on file</p>
                {REQUIRED_DOCS.map((d) => (
                  <div key={d.key} className="flex items-center gap-2 text-sm">
                    {driver[d.key] ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-muted-foreground" />}
                    <span className={driver[d.key] ? "" : "text-muted-foreground"}>{d.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 text-sm pt-1 border-t border-border/40 mt-2">
                  <CheckCircle2 className={`w-4 h-4 ${driver.bank_account_number ? "text-emerald-400" : "text-muted-foreground"}`} />
                  <span className={driver.bank_account_number ? "" : "text-muted-foreground"}>Bank account for payouts</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">⏳ Pending admin approval. We'll email {driver.email || "your account"} with your login details once approved.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const isNew = me === false;

  return (
    <div>
      <PageHeader
        eyebrow={isNew ? "Become a driver" : "Driver sign-up"}
        title={isNew ? "Create your driver account" : "Driver sign-up"}
        subtitle={isNew
          ? "Set up your login and vehicle details. Admin approval is required before you can go online."
          : "Join Ride X as a driver. Admin approval is required before you can go online and receive ride pings."}
      />
      <form onSubmit={submit} className="max-w-xl space-y-4 rounded-3xl border border-border/60 bg-card p-6">
        {isNew && (
          <div className="rounded-2xl bg-primary/10 border border-primary/30 p-3 text-sm text-primary">
            Create your account below — you'll verify your email, then we save your driver profile. Log in anytime with these credentials.
          </div>
        )}
        {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Full name</Label>
            <Input className="rounded-xl mt-1" value={form.full_name} onChange={set("full_name")} required />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input className="rounded-xl mt-1" value={form.phone} onChange={set("phone")} placeholder="080..." required />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Email {isNew ? "(your login)" : "(for login & approval updates)"}</Label>
            <Input className="rounded-xl mt-1" type="email" value={form.email} onChange={set("email")} placeholder="you@email.com" required readOnly={!isNew && !!me?.email} />
          </div>
          {isNew && (
            <div>
              <Label className="text-xs">Password</Label>
              <Input className="rounded-xl mt-1" type="password" value={form.password} onChange={set("password")} placeholder="••••••••" required autoComplete="new-password" />
            </div>
          )}
        </div>
        {isNew && (
          <div>
            <Label className="text-xs">Confirm password</Label>
            <Input className="rounded-xl mt-1" type="password" value={form.confirm_password} onChange={set("confirm_password")} placeholder="••••••••" required autoComplete="new-password" />
          </div>
        )}
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Vehicle type</Label>
            <select value={form.vehicle_type} onChange={set("vehicle_type")} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm">
              {VEHICLE_TYPES.map((v) => <option key={v} value={v} className="bg-card">{v}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">License plate</Label>
            <Input className="rounded-xl mt-1" value={form.license_plate} onChange={set("license_plate")} required />
          </div>
          <div>
            <Label className="text-xs">Vehicle colour</Label>
            <Input className="rounded-xl mt-1" value={form.vehicle_color} onChange={set("vehicle_color")} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Driver licence number</Label>
          <Input className="rounded-xl mt-1" value={form.driver_license} onChange={set("driver_license")} placeholder="Licence number" required />
        </div>

        <div className="pt-2">
          <p className="text-sm font-semibold mb-1">Required documents</p>
          <p className="text-xs text-muted-foreground mb-3">Upload clear photos or PDFs. We review these before approving you to drive.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {REQUIRED_DOCS.map((d) => (
              <DocumentUpload key={d.key} label={d.label} value={form[d.key]} onChange={setDoc(d.key)} />
            ))}
          </div>
        </div>

        <div className="pt-2">
          <p className="text-sm font-semibold mb-1">Bank account for payouts</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Bank name</Label>
              <Input className="rounded-xl mt-1" value={form.bank_name} onChange={set("bank_name")} placeholder="e.g. GTBank" />
            </div>
            <div>
              <Label className="text-xs">Account name</Label>
              <Input className="rounded-xl mt-1" value={form.bank_account_name} onChange={set("bank_account_name")} />
            </div>
            <div>
              <Label className="text-xs">Account number</Label>
              <Input className="rounded-xl mt-1" value={form.bank_account_number} onChange={set("bank_account_number")} placeholder="0123456789" />
            </div>
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-2xl bg-secondary/40 p-3 cursor-pointer">
          <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-0.5 w-5 h-5 accent-primary shrink-0" />
          <span className="text-sm text-muted-foreground leading-relaxed">
            I have read and agree to the{" "}
            <Link to="/driver-terms" target="_blank" className="text-primary font-medium hover:underline inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Driver Terms & Conditions
            </Link>
            , confirm that I am an independent contractor (not an employee of Ride X), and confirm I hold or will maintain valid commercial/e-hailing insurance.
          </span>
        </label>

        <Button type="submit" className="rounded-full w-full h-11 font-semibold" disabled={busy || !termsAccepted}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Car className="w-4 h-4 mr-2" /> {isNew ? "Create account & submit" : "Submit for approval"}</>}
        </Button>
        {isNew ? (
          <p className="text-xs text-muted-foreground text-center">
            Already have an account?{" "}
            <Link to="/login?next=/driver-signup" className="text-primary font-medium hover:underline inline-flex items-center gap-1">
              <LogIn className="w-3 h-3" /> Log in
            </Link>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Already have an account? Your sign-up is linked to your RIDE X login.</p>
        )}
      </form>
    </div>
  );
}