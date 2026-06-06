 
function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-white/[0.07]" />
      {label && <span className="text-[11px] text-white/25 whitespace-nowrap">{label}</span>}
      <div className="flex-1 h-px bg-white/[0.07]" />
    </div>
  );
}
export default Divider