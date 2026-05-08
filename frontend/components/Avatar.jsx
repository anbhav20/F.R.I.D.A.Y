function Avatar({ name, size = "md" }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const sizes = { sm: "w-7 h-7 text-[10px]", md: "w-9 h-9 text-xs", lg: "w-10 h-10 text-sm" };
  return (
    <div className={`${sizes[size]} rounded-full bg-linear-to-br from-orange-500 to-amber-400 flex items-center justify-center font-bold text-white shrink-0`}>
      {initials}
    </div>
  );
}
export default Avatar