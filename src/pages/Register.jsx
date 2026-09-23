import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, User, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!email || !password) throw new Error("Email and password required");
      if (password.length < 6) throw new Error("Password must be at least 6 characters");
      await base44.auth.register({ email, password, full_name: fullName });
      window.location.href = returnTo || "/";
    } catch (err) {
      setError(err.message || "Could not create account");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", returnTo);
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link to={"/login"} className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" className="pl-9" autoComplete="name" />
          </div>
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <div className="relative mt-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="pl-9" autoComplete="email" required />
          </div>
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative mt-1">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className="pl-9" autoComplete="new-password" required />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-500/10 p-2 rounded">{error}</p>
        )}

        <Button type="submit" disabled={loading} className="w-full h-12">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
