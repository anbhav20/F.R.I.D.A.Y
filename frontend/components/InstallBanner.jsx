import { usePWA } from "../src/hooks/usePWA";
import { Download, X } from "lucide-react";

export default function InstallBanner() {
  const { showInstall, installApp, dismissInstall } = usePWA();

  if (!showInstall) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-[#2a2a2a] border border-white/10 rounded-2xl p-4 flex items-center gap-3 shadow-xl">
      <div className="flex-1">
        <p className="text-sm text-white font-medium">Install F.R.I.D.A.Y</p>
        <p className="text-xs text-zinc-500 mt-0.5">Add to home screen for best experience</p>
      </div>
      <button
        onClick={installApp}
        className="flex items-center gap-1.5 bg-white text-black text-xs font-medium px-3 py-2 rounded-xl hover:bg-zinc-200 transition-colors"
      >
        <Download size={12} />
        Install
      </button>
      <button
        onClick={dismissInstall}
        className="text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}