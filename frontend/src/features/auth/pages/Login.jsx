import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useSelector } from "react-redux";

import { useAuth } from "../hook/useAuth";
import AuthMessage from "../../../../components/AuthMessage";
import Divider from "../../../../components/Divider";
import Card from "../../../../components/Card";
import Logo from "../../../../components/Logo";

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const { loginUser } = useAuth();
  const { loading } = useSelector((state) => state.auth);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await loginUser({ email, password });
    if (res?.success) {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen mesh-bg flex items-center justify-center px-4 py-6">
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-16 w-56 h-56 bg-orange-500/20 blur-3xl rounded-full" />
        <div className="absolute -bottom-24 -right-16 w-56 h-56 bg-amber-300/10 blur-3xl rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <Logo
          size="md"
          title="Welcome back"
          subtitle="Login to continue"
        />

        <Card>
          {/* AuthMessage outside form */}
          <AuthMessage />

          {/* Google */}
          <button
            type="button"
            className="w-full h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs font-medium text-white"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <Divider />

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {/* Email */}
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">
                Email Address
              </label>
              <div className="relative">
                <Mail
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="input-field text-sm pl-9 h-5"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-zinc-400">
                  Password
                </label>
                <button
                  type="button"
                  className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="input-field text-sm pl-9 pr-9 h-5"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full h-9 text-sm font-semibold text-white shadow-md shadow-orange-500/20 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all mt-4!"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Bottom */}
          <p className="text-center text-xs text-zinc-500 mt-4">
            Don&apos;t have an account?{" "}
            <Link
              to="/signup"
              className="text-orange-400 hover:text-orange-300 font-medium transition-colors"
            >
              Create account
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}