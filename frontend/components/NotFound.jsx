import { Link } from "react-router-dom";
import Logo from "./Logo";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#212121] flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm">
        <Logo size="md" title="Lost in space" subtitle="This page doesn't exist" />

        <div className="bg-[#2a2a2a] border border-white/8 rounded-2xl p-7 text-center">
          {/* 404 number */}
          <p className="text-6xl font-bold text-white mb-1">404</p>
          <div className="h-px bg-white/8 my-5" />

          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            The page you're looking for doesn't exist or has been moved.
          </p>

          <Link
            to="/chat"
            className="w-full block bg-white text-black rounded-xl py-2.5 text-sm font-medium hover:bg-zinc-200 active:scale-[0.98] transition-all"
          >
            Back to F.R.I.D.A.Y
          </Link>

          <p className="text-center text-xs text-zinc-600 mt-5">
            Need help?{" "}
            <Link to="/login" className="text-zinc-400 hover:text-zinc-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}