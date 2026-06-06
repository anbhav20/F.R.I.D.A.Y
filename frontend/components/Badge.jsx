function Badge({ children, color = "orange" }) {
  const colors = {
    orange: "bg-orange-500/15 text-orange-400",
    green: "bg-green-500/15 text-green-400",
    blue: "bg-blue-500/15 text-blue-400",
    gray: "bg-white/8 text-white/40",
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${colors[color]}`}>
      {children}
    </span>
  );
}
export default Badge