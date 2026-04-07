"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/public/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push("/account");
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 sm:py-24">
      <div className="text-center mb-8">
        <h1 className="font-headline text-2xl font-bold">Sign In</h1>
        <p className="text-on-surface-variant text-sm mt-2">Access your saved vehicles, inquiries, and delivery tracking.</p>
      </div>

      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        {error && <div className="mb-4 p-3 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-1.5">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Your password"
              className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <button type="submit" disabled={loading} className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl hover:shadow-[0_0_20px_rgba(173,198,255,0.4)] transition-all disabled:opacity-50">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-on-surface-variant mt-4">
          Don&apos;t have an account? <Link href="/register" className="text-primary font-bold">Create Account</Link>
        </p>
      </div>
    </div>
  );
}
