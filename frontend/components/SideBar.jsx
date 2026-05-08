import { useState } from 'react';
import {
  Plus, MessageSquare, Settings, LogOut, 
  Sparkles, Trash2, X
} from 'lucide-react';


import { useAuth } from "../src/features/auth/hook/useAuth"
import { useNavigate } from 'react-router-dom';

const Logo = () => (
  <div className="flex items-center gap-2.5">
    <div className="relative w-8 h-8">
      <div className="absolute inset-0 rounded-lg bg-linear-to-br from-aurora to-teal-glow opacity-90" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Sparkles size={15} className="text-white" />
      </div>
    </div>
    <span className="text-white font-semibold text-base tracking-tight">Cloude</span>
    <span className="text-xs bg-aurora/20 text-aurora-light px-1.5 py-0.5 rounded-md font-mono">AI</span>
  </div>
);

export default function Sidebar({ chats, activeChat, onNewChat, onSelectChat, onDeleteChat, isOpen, onClose }) {
  const {logOut} =useAuth()

  const navigate = useNavigate();
  const [hoveredChat, setHoveredChat] = useState(null);

  const handleLogout = async() => {
    await logOut();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:relative top-0 left-0 h-full z-30 lg:z-auto
          w-72 flex flex-col bg-ink-900 border-r border-ink-700
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-ink-700">
          <Logo />
          <button onClick={onClose} className="lg:hidden btn-ghost p-1.5">
            <X size={18} />
          </button>
        </div>

        {/* New Chat */}
        <div className="px-3 pt-3 pb-2">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-aurora/10 hover:bg-aurora/20 border border-aurora/20 hover:border-aurora/40 text-aurora-light text-sm font-medium transition-all duration-200 group"
          >
            <Plus size={16} className="group-hover:rotate-90 transition-transform duration-200" />
            New conversation
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
          {Object.entries(groupedChats).map(([group, items]) =>
            items.length > 0 ? (
              <div key={group}>
                <p className="text-xs text-slate-600 font-medium px-2 mb-1.5 uppercase tracking-wider">{group}</p>
                <div className="space-y-0.5">
                  {items.map((chat) => (
                    <div
                      key={chat.id}
                      onMouseEnter={() => setHoveredChat(chat.id)}
                      onMouseLeave={() => setHoveredChat(null)}
                      onClick={() => { onSelectChat(chat.id); onClose(); }}
                      className={`
                        group relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150
                        ${activeChat === chat.id
                          ? 'bg-surface-raised text-white border border-ink-600'
                          : 'text-slate-400 hover:text-white hover:bg-surface-hover'
                        }
                      `}
                    >
                      <MessageSquare size={14} className="shrink-0 opacity-60" />
                      <span className="text-sm truncate flex-1">{chat.title}</span>
                      {hoveredChat === chat.id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                          className="shrink-0 p-1 rounded-md hover:bg-red-500/20 hover:text-red-400 transition-colors"
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
            <div className="text-center py-8">
              <MessageSquare size={28} className="text-slate-700 mx-auto mb-2" />
              <p className="text-slate-600 text-xs">No conversations yet</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-ink-700 p-3 space-y-1">
          <button className="sidebar-item w-full">
            <Settings size={16} />
            Settings
          </button>
          <button
            onClick={handleLogout}
            className="sidebar-item w-full text-slate-500 hover:text-red-400 hover:bg-red-500/10"
          >
            <LogOut size={16} />
            Sign out
          </button>

          {/* User info */}
          <div className="flex items-center gap-3 px-3 py-2.5 mt-1 rounded-xl bg-surface-raised border border-ink-600">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-aurora to-teal-glow flex items-center justify-center text-white text-sm font-semibold shrink-0">
              {user?.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.username || 'User'}</p>
              <p className="text-slate-500 text-xs truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}