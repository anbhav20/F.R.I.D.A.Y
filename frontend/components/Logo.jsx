function Logo({
  size = "md",
  title = "Create account",
  subtitle = "Start using F.R.I.D.A.Y AI",
}) {
  const sizes = {
    sm: {
      box: "w-6 h-6",
      title: "text-base",
    },

    md: {
      box: "w-10 h-10",
      title: "text-xl",
    },

    lg: {
      box: "w-14 h-14",
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
          overflow-hidden
          mx-auto mb-3
          shadow-lg 
        `}
      >
        <img
          src="/favicon/favicon-96x96.png"
          alt="F.R.I.D.A.Y AI Logo"
          className="w-full h-full object-cover"
        />
      </div>

      <h1 className={`${s.title} font-bold tracking-tight text-white`}>
        {title}
      </h1>

      <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
    </div>
  );
}

export default Logo;