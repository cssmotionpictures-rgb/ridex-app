import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, User, Loader2, ShieldCheck } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Register() {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const returnTo = safeReturnTo();

  const handleSendCode = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!email || !password) throw new Error("Email and password required");
      if (password.length < 6) throw new Error("Password must be at least 6 characters");
      await base44.auth.register({ email, password, full_name: fullName });
      setStep(2);
    } catch (err) {
      setError(err.message || "Could not send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!code || code.length < 6) throw new Error("Enter the 6-digit code");
      await base44.auth.verifyOtp({ email, token: code, type: "email" });
      window.location.href = returnTo || "/";
    } catch (err) {
      setError(err.message || "Invalid or expired code");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", returnTo);
  };

  return (
    <AuthLayout
      icon={step === 1 ? UserPlus : ShieldCheck}
      title={step === 1 ? "Create your account" : "Check your email"}
      subtitle={step === 1 ? "Sign up to get started" : `We sent a 6-digit code to ${email}`}
      footer={
        step === 1 ? (
          <>
            Already have an account?{" "}
            <Link to={"/login"} className="text-primary font-medium hover:underline">
              Log in
            </Link>
          </>
        ) : (
          <button
            onClick={() => { setStep(1); setCode(""); setError(""); }}
            className="text-primary font-medium hover:underline"
          >
            Use a different email
          </button>
        )
      }
    >
      {step === 1 ? (
        <form onSubmit={handleSendCode} className="space-y-4">
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 text-sm font-medium mb-2"
            onClick={handleGoogle}
          >
            <GoogleIcon className="w-5 h-5 mr-2" /> Continue with Google
          </Button>

          <div className="relative text-center text-xs text-muted-foreground my-3">
            <span className="bg-card px-2 relative z-10">or sign up with email</span>
          </div>

          <div>
            <Label htmlFor="name">Full name</Label>
            <div className="relative mt-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="pl-9"
                autoComplete="name"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="pl-9"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="pl-9"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-500/10 p-2 rounded">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full h-12">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send verification code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <Label htmlFor="code">6-digit code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="text-center text-2xl tracking-[0.5em] font-mono h-14 mt-1"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-500/10 p-2 rounded">{error}</p>
          )}

          <Button type="submit" disabled={loading || code.length < 6} className="w-full h-12">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify and continue"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Didn't receive it? Check your spam folder. The code expires in 60 minutes.
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
