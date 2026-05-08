import { useEffect } from "react";

import AuthMessage from "../../../../components/AuthMessage";

export default function VerifyEmail() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");

    if (!token) return;

    window.location.href = `http://localhost:3000/api/auth/verify-email?token=${token}`;
  }, []);

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center px-4">
      <div className="glass rounded-3xl p-8 w-full max-w-md text-center">
        <div
          className="
            w-16 h-16 rounded-2xl
            bg-linear-to-br
            from-orange-500
            to-amber-300
            flex items-center justify-center
            mx-auto mb-6
          "
        >
          ✨
        </div>

        <h1 className="text-2xl font-bold mb-2">Verifying Email</h1>

        <p className="text-zinc-400 text-sm mb-6">
          Please wait while we verify your account...
        </p>

        <AuthMessage />
      </div>
    </div>
  );
}
