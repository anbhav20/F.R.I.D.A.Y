function Card({ children, className = "", hoverable, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-[#13131A] border border-white/[0.07] rounded-2xl p-5 transition-all duration-200
        ${hoverable ? "cursor-pointer hover:bg-[#1A1A24] hover:border-orange-500/30 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-500/5" : ""}
        ${className}`}
    >
      {children}
    </div>
  );
}
 
export default Card