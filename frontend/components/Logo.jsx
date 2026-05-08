import { Sparkles } from "lucide-react";

function Logo({
  size = "md",
  title = "Create account",
  subtitle = "Start using F.R.I.D.A.Y AI",
}) {
  const sizes = {
    sm: {
      box: "w-6 h-6",
      icon: 14,
      title: "text-base",
    },

    md: {
      box: "w-10 h-10",
      icon: 18,
      title: "text-xl",
    },

    lg: {
      box: "w-14 h-14",
      icon: 22,
      title: "text-2xl",
    },
  };

  const s = sizes[size];

  return (
    <div className="text-center mb-3">
      <div
        className={`
          ${s.box}
          rounded-xl
          bg-gradient-to-br
          from-orange-500
          to-amber-400
          flex items-center justify-center
          mx-auto mb-3
          shadow-lg shadow-orange-500/30
        `}
      >
        <Sparkles size={s.icon} className="text-white" />
      </div>

      <h1 className={`${s.title} font-bold tracking-tight text-white`}>
        {title}
      </h1>

      <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
    </div>
  );
}

export default Logo;
