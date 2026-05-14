import { Trash2, X, LogOut, SquarePen } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../src/features/auth/hook/useAuth";

const groupChats = (chats) => {
  const now = Date.now();
  const DAY = 86400000;
  const groups = { Today: [], Yesterday: [], "Previous 7 Days": [], Older: [] };
  chats.forEach((c) => {
    const diff = now - new Date(c.updatedAt).getTime();
    if      (diff < DAY)       groups.Today.push(c);
    else if (diff < 2 * DAY)   groups.Yesterday.push(c);
    else if (diff < 7 * DAY)   groups["Previous 7 Days"].push(c);
    else                       groups.Older.push(c);
  });
  return groups;
};

export default function Sidebar({ isOpen, onClose, chats, activeChat, onNewChat, onSelectChat, onDeleteChat, user }) {
  const { logOut } = useAuth();
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(null);

  const grouped = groupChats(chats);

  const handleLogout = async () => {
    await logOut();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed lg:relative top-0 left-0 h-full h-[100dvh] z-30 lg:z-auto
          w-64 flex flex-col bg-[#171717]
          transition-transform duration-200 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 shrink-0">
          <span className="text-sm font-semibold text-white tracking-wide">F.R.I.D.A.Y</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { onNewChat(); onClose(); }}
              className="p-2 rounded-lg hover:bg-white/10 transition text-zinc-400 hover:text-white"
              title="New chat"
            >
              <SquarePen size={16} />
            </button>
            <button
              onClick={onClose}
              className="lg:hidden p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4 sidebar-scroll">
          {Object.entries(grouped).map(([group, items]) =>
            items.length > 0 ? (
              <div key={group}>
                <p className="text-xs text-zinc-500 font-medium px-2 mb-1">{group}</p>
                <div className="space-y-0.5">
                  {items.map((chat) => (
                    <div
                      key={chat._id}
                      onMouseEnter={() => setHovered(chat._id)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => { onSelectChat(chat); onClose(); }}
                      className={`
                        group relative flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors
                        ${activeChat?._id === chat._id
                          ? "bg-white/10 text-white"
                          : "text-zinc-400 hover:text-white hover:bg-white/5"
                        }
                      `}
                    >
                      <span className="text-xs truncate flex-1">{chat.title}</span>
                      {hovered === chat._id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteChat(chat._id); }}
                          className="shrink-0 p-1 rounded hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )}

          {chats.length === 0 && (
            <div className="text-center py-10">
              <p className="text-zinc-600 text-xs">No conversations yet</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/5 p-2 space-y-0.5 shrink-0">
          
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 text-xs transition"
          >
            <LogOut size={14} />
            Sign out
          </button>
          <div className="flex items-center gap-2.5 px-3 py-2 mt-1 rounded-lg hover:bg-white/5 transition cursor-default">
            <div className="w-7 h-7 rounded-full bg-zinc-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {user?.username?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.username ?? "User"}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}