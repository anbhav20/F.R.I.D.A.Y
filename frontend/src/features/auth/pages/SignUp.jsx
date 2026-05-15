import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useSelector } from "react-redux";
import { useDispatch } from "react-redux";
import { setError } from "../auth.slice"

import { useAuth } from "../hook/useAuth";
import AuthMessage from "../../../../components/AuthMessage";
import Logo from "../../../../components/Logo";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  
const dispatch = useDispatch();
  const { registerUser } = useAuth();
  const { loading } = useSelector((state) => state.auth);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()||!email.includes("@")) return dispatch(setError("Please enter your email."));
    if (!password.trim()) return dispatch(setError("Please enter a password."));
    if (password.length < 6)
      return dispatch(setError("Password must be at least 6 characters."));
    const username = email.split("@")[0].toLowerCase();
    const res = await registerUser(username, email, password);
    if (res?.success) {
      setEmail("");
      setPassword("");
    }
  };

  const passwordStrength =
    password.length === 0
      ? null
      : password.length < 6
        ? "weak"
        : password.length < 10
          ? "fair"
          : "strong";

  const strengthConfig = {
    weak: { label: "Weak", color: "#ef4444", width: "33%" },
    fair: { label: "Fair", color: "#f59e0b", width: "66%" },
    strong: { label: "Strong", color: "#22c55e", width: "100%" },
  };

  return (
    <div className="min-h-screen bg-[#212121] flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm">
        <Logo
          size="md"
          title="Create account"
          subtitle="Start using F.R.I.D.A.Y"
        />

        <div className="bg-[#2a2a2a] border border-white/8 rounded-2xl p-7">
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 pl-9 pr-3 py-2 outline-none focus:border-white/20 transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
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

              {/* Password Strength */}
              {passwordStrength && (
                <div className="mt-1.5">
                  <div className="h-0.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: strengthConfig[passwordStrength].width,
                        backgroundColor: strengthConfig[passwordStrength].color,
                      }}
                    />
                  </div>
                  <p
                    className="text-xs mt-1"
                    style={{ color: strengthConfig[passwordStrength].color }}
                  >
                    {strengthConfig[passwordStrength].label} password
                  </p>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black rounded-xl py-2.5 text-sm font-medium hover:bg-zinc-200 active:scale-[0.98] transition-all mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z"
                    />
                  </svg>
                  Creating account...
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <p className="text-center text-xs text-zinc-600 mt-5">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-zinc-400 hover:text-zinc-300 font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
