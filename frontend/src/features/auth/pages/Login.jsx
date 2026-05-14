import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useSelector } from "react-redux";

import { useAuth } from "../hook/useAuth";
import AuthMessage from "../../../../components/AuthMessage";
import Logo from "../../../../components/Logo";

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
    <div className="min-h-screen bg-[#212121] flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm">
        <Logo
          size="md"
          title="Welcome back"
          subtitle="Login to continue"
        />

        <div className="bg-[#2a2a2a] border border-white/[0.08] rounded-2xl p-7">
          <AuthMessage />

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {/* Email */}
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">
                Email Address
              </label>
              <div className="relative">
                <Mail
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
                />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 pl-9 pr-3 py-2 outline-none focus:border-white/20 transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-zinc-500">Password</label>
                <button
                  type="button"
                  className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 pl-9 pr-9 py-2 outline-none focus:border-white/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
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
              className="w-full bg-white text-black rounded-xl py-2.5 text-sm font-medium hover:bg-zinc-200 active:scale-[0.98] transition-all mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
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

          <p className="text-center text-xs text-zinc-600 mt-5">
            Don&apos;t have an account?{" "}
            <Link
              to="/signup"
              className="text-zinc-400 hover:text-zinc-300 font-medium transition-colors"
            >
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}