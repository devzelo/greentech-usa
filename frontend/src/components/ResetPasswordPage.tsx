import { motion } from "motion/react";
import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, ShieldCheck, Loader2, CheckCircle2, X, Eye, EyeOff } from "lucide-react";
import { resetPassword } from "../lib/api";
import { useMeta } from "../hooks/useMeta";
import PoweredByProjnell from "./PoweredByProjnell";

export default function ResetPasswordPage() {
  useMeta({
    title: "Reset Password",
    description: "Reset your GreenTech USA dashboard password.",
  });
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed. The link may have expired.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-[2.5rem] p-10 shadow-xl text-center max-w-md w-full">
          <X size={40} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Invalid Link</h2>
          <p className="text-slate-500 text-sm mb-6">This reset link is missing a token. Please request a new one.</p>
          <button onClick={() => navigate("/login")} className="bg-gt-gradient text-white px-8 py-3 rounded-2xl font-bold">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gt-gradient" />
      <div className="absolute top-[10%] left-[10%] w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-[10%] right-[10%] w-96 h-96 bg-secondary/5 rounded-full blur-3xl -z-10" />

      <div className="w-full max-w-[440px]">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-gt-gradient rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary/20">
            <ShieldCheck className="text-white" size={40} />
          </div>
          <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">Set New Password</h1>
          <p className="text-slate-500">Choose a strong password for your account.</p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-white p-8 md:p-10 rounded-[2.5rem] shadow-2xl shadow-slate-200">
          {done ? (
            <div className="text-center space-y-6 py-4">
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 size={36} className="text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 mb-2">Password Updated!</h2>
                <p className="text-sm text-slate-500">Your password has been changed successfully. You can now sign in.</p>
              </div>
              <button
                onClick={() => navigate("/login")}
                className="w-full bg-gt-gradient text-white py-4 rounded-2xl font-bold hover:shadow-xl hover:shadow-primary/30 transition-all"
              >
                Go to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-2xl px-4 py-3 flex items-center gap-2">
                  <X size={16} className="flex-shrink-0" /> {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full pl-12 pr-12 py-4 rounded-2xl bg-white border border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                  />
                </div>
              </div>

              <button
                disabled={isLoading}
                className="w-full bg-gt-gradient text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              >
                {isLoading ? <Loader2 size={22} className="animate-spin" /> : "Update Password"}
              </button>
            </form>
          )}
        </div>

        <div className="mt-10 flex flex-col items-center gap-4">
          <p className="text-sm text-slate-400">
            &copy; 2026 GreenTech USA LLC. Secure Internal Access.
          </p>
          <PoweredByProjnell tone="light" />
        </div>
      </div>
    </div>
  );
}
