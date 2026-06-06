import { useState } from "react";
function Input({ label, type = "text", placeholder, value, onChange, icon, error }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="mb-4">
      {label && (
        <label className="block text-xs font-medium text-white/50 mb-1.5 tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-base transition-colors duration-200 ${focused ? "text-orange-400" : "text-white/25"}`}>
            {icon}
          </span>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`w-full bg-white/[0.04] border rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all duration-200 font-[inherit]
            ${icon ? "pl-10 pr-4 py-3" : "px-4 py-3"}
            ${error ? "border-red-500 focus:ring-2 focus:ring-red-500/20" : focused ? "border-orange-500 ring-2 ring-orange-500/15" : "border-white/10 hover:border-white/20"}`}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
} export default Input