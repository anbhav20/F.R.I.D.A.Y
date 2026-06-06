function Button({ children, onClick, variant = "primary", fullWidth, size = "md", disabled, className = "" }) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed";
 
  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-7 py-3.5 text-base",
  };
   const variants = {
    primary: "bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:from-orange-700 hover:via-orange-600 hover:to-amber-600 hover:-translate-y-0.5 active:translate-y-0",
    ghost: "bg-transparent text-white/80 border border-white/10 hover:bg-white/5 hover:text-white",
    outline: "bg-transparent text-orange-400 border border-orange-500/40 hover:bg-orange-500/10 hover:border-orange-400",
    danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
  };
 
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
 export default Button