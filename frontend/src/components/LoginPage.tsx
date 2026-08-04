import { motion, AnimatePresence } from "motion/react";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, LogIn, ArrowLeft, ShieldCheck, X, CheckCircle2, Loader2, Eye, EyeOff } from "lucide-react";
import { login, forgotPassword, setAuthToken, setAuthUser } from "../lib/api";
import { useMeta } from "../hooks/useMeta";
import PoweredByProjnell from "./PoweredByProjnell";

type View = "login" | "forgot" | "forgot-sent";

export default function LoginPage() {
  useMeta({
    title: "Login",
    description: "Sign in to the GreenTech USA dashboard — for employees and project subcontractors.",
  });
  const [view, setView] = useState<View>("login");
  const [loginTab, setLoginTab] = useState<"employee" | "subcontractor" | "partner">("employee");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Forgot password
  const [fpEmail, setFpEmail] = useState("");
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError, setFpError] = useState("");

  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const data = await login(email, password);
      const role = (data.user as { role?: string }).role;
      // Partners are guest accounts too (role "subcontractor"), so the Partner tab authenticates
      // exactly like the Subcontractor tab — both require a guest account.
      const guestTab = loginTab === "subcontractor" || loginTab === "partner";
      // Make sure the chosen tab matches the account type.
      if (guestTab && role !== "subcontractor") {
        setError("This is an employee account — use the Employee tab.");
        setIsLoading(false);
        return;
      }
      if (loginTab === "employee" && role === "subcontractor") {
        setError("This is a subcontractor/partner account — use the Subcontractor or Partner tab.");
        setIsLoading(false);
        return;
      }
      setAuthToken(data.token);
      setAuthUser(data.user);
      navigate(role === "subcontractor" ? "/dashboard/my-projects" : "/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpError("");
    setFpLoading(true);
    try {
      await forgotPassword(fpEmail);
      setView("forgot-sent");
    } catch (err: unknown) {
      setFpError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setFpLoading(false);
    }
  };

  const openForgot = () => {
    setFpEmail(email); // pre-fill with whatever is in login email field
    setFpError("");
    setView("forgot");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gt-gradient" />
      <div className="absolute top-[10%] left-[10%] w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-[10%] right-[10%] w-96 h-96 bg-secondary/5 rounded-full blur-3xl -z-10" />

      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => navigate("/")}
        className="absolute top-8 left-8 flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium"
      >
        <ArrowLeft size={20} /> Back to Home
      </motion.button>

      <div className="w-full max-w-[540px]">
        {/* Logo */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-20 h-20 bg-gt-gradient rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary/20"
          >
            <ShieldCheck className="text-white" size={40} />
          </motion.div>
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="font-display text-3xl font-bold text-slate-900 mb-3"
          >
            {loginTab === "subcontractor" ? "Subcontractor Access" : loginTab === "partner" ? "Partner Access" : "Employee Portal"}
          </motion.h1>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-slate-500"
          >
            {loginTab === "subcontractor"
              ? "Sign in to view the projects shared with you."
              : loginTab === "partner"
              ? "Sign in to view your joint-venture projects."
              : "Sign in to manage projects and internal documents."}
          </motion.p>
        </div>

        {/* Card */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white/80 backdrop-blur-xl border border-white p-8 md:p-10 rounded-[2.5rem] shadow-2xl shadow-slate-200"
        >
          <AnimatePresence mode="wait">

            {/* ── LOGIN VIEW ── */}
            {view === "login" && (
              <motion.form
                key="login"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleLogin}
                className="space-y-6"
              >
                {/* Employee / Subcontractor / Partner tabs */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-2xl p-1">
                  {(["employee", "subcontractor", "partner"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setLoginTab(t); setError(""); }}
                      className={`flex-1 px-2 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition-all ${
                        loginTab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      {t === "employee" ? "Employee" : t === "subcontractor" ? "Subcontractor" : "Partner"}
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-2xl px-4 py-3 flex items-center gap-2">
                    <X size={16} className="flex-shrink-0" /> {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={loginTab === "employee" ? "name@gt-usa.com" : "you@example.com"}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-sm font-bold text-slate-700">Password</label>
                    {loginTab === "employee" && (
                      <button
                        type="button"
                        onClick={openForgot}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
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

                <button
                  disabled={isLoading}
                  className="w-full bg-gt-gradient text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg mt-4"
                >
                  {isLoading ? (
                    <Loader2 size={22} className="animate-spin" />
                  ) : (
                    <><LogIn size={20} /> {loginTab === "employee" ? "Access Dashboard" : "View My Projects"}</>
                  )}
                </button>
              </motion.form>
            )}

            {/* ── FORGOT PASSWORD VIEW ── */}
            {view === "forgot" && (
              <motion.form
                key="forgot"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleForgotPassword}
                className="space-y-6"
              >
                <button
                  type="button"
                  onClick={() => setView("login")}
                  className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-700 text-sm font-medium transition-colors"
                >
                  <ArrowLeft size={16} /> Back to login
                </button>

                <div className="pt-4">
                  <h2 className="text-2xl font-display font-bold text-slate-900 mb-2">Forgot Password</h2>
                  <p className="text-sm text-slate-500">Enter your account email and we'll send a reset link.</p>
                </div>

                {fpError && (
                  <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-2xl px-4 py-3 flex items-center gap-2">
                    <X size={16} className="flex-shrink-0" /> {fpError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="email"
                      required
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      placeholder="name@gt-usa.com"
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                    />
                  </div>
                </div>

                <button
                  disabled={fpLoading}
                  className="w-full bg-gt-gradient text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {fpLoading ? <Loader2 size={20} className="animate-spin" /> : "Send Reset Link"}
                </button>
              </motion.form>
            )}

            {/* ── SENT CONFIRMATION VIEW ── */}
            {view === "forgot-sent" && (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-center space-y-6 py-4"
              >
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
                  <CheckCircle2 size={36} className="text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-xl font-display font-bold text-slate-900 mb-2">Check Your Email</h2>
                  <p className="text-sm text-slate-500">
                    If <span className="font-bold text-slate-700">{fpEmail}</span> is registered, you'll receive a reset link within a few minutes.
                  </p>
                  <p className="text-xs text-slate-400 mt-3">
                    Can't find it? Check your spam folder.
                  </p>
                </div>
                <button
                  onClick={() => setView("login")}
                  className="w-full py-3 rounded-2xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Back to Login
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-10 flex flex-col items-center gap-4"
        >
          <p className="text-sm text-slate-400">
            &copy; 2026 GreenTech USA LLC. Secure Internal Access.
          </p>
          <PoweredByProjnell tone="light" />
        </motion.div>
      </div>
    </div>
  );
}
