import { useEffect } from "react";
import { Mail } from "lucide-react";
import AuthMessage from "../../../../components/AuthMessage";

export default function VerifyEmail() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return;
    window.location.href = `${import.meta.env.VITE_SERVER_URI}/api/auth/verify-email?token=${token}`;
  }, []);

  return (
    <div className="min-h-screen bg-[#212121] text-white flex items-center justify-center px-4">
      <div className="bg-[#2a2a2a] border border-white/8 rounded-2xl p-8 w-full max-w-sm text-center">
        <div className="w-11 h-11 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center mx-auto mb-5">
          <Mail size={18} className="text-zinc-400" />
        </div>

        <h1 className="text-base font-medium text-white mb-1">Verifying your email</h1>

        <p className="text-zinc-500 text-xs mb-6">
          Please wait while we verify your account...
        </p>

        <AuthMessage />
      </div>
    </div>
  );
}