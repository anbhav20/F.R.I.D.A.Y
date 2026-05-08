import {
  Menu,
  Plus,
  Send,
  Bot,
  User,
} from "lucide-react";

export default function Chat() {
  return (
    <div className="h-screen bg-[#0f172a] text-white flex">

      {/* Sidebar  <Sidebar/>*/}

      <aside className="hidden md:flex w-72 bg-[#111827] border-r border-white/10 flex-col">

        {/* Top */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h1 className="text-lg font-semibold">
            F.R.I.D.A.Y 
          </h1>

          <button className="p-2 rounded-lg hover:bg-white/10 transition">
            <Menu size={20} />
          </button>
        </div>

        {/* New Chat */}
        <div className="p-4">
          <button className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-cyan-500 hover:opacity-90 transition rounded-xl py-3 font-medium">
            <Plus size={18} />
            New Chat
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-3 space-y-2">
          {[
            "React authentication setup",
            "How JWT works",
            "Modern UI inspiration",
            "Tailwind responsive layout",
          ].map((chat, index) => (
            <button
              key={index}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 transition text-sm text-slate-300"
            >
              {chat}
            </button>
          ))}
        </div>

        {/* Bottom */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center font-semibold">
              A
            </div>

            <div>
              <p className="text-sm font-medium">
                Abhishek
              </p>

              <p className="text-xs text-slate-400">
                Free Plan
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat */}
      <main className="flex-1 flex flex-col">

        {/* Mobile Header */}
        <div className="md:hidden p-4 border-b border-white/10 flex items-center justify-between">
          <button className="p-2 rounded-lg hover:bg-white/10">
            <Menu size={22} />
          </button>

          <h1 className="font-semibold">
            Cloude AI
          </h1>

          <button className="p-2 rounded-lg hover:bg-white/10">
            <Plus size={22} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">

          {/* AI Message */}
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
              <Bot size={18} />
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 max-w-2xl">
              <p className="text-sm text-slate-200 leading-relaxed">
                Hey 👋 How can I help you today?
              </p>
            </div>
          </div>

          {/* User Message */}
          <div className="flex gap-3 justify-end">
            <div className="bg-gradient-to-r from-violet-600 to-cyan-500 rounded-2xl px-5 py-4 max-w-2xl">
              <p className="text-sm leading-relaxed">
                Create a modern AI chat interface.
              </p>
            </div>

            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
              <User size={18} />
            </div>
          </div>
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/10 bg-[#0f172a]">
          <div className="max-w-4xl mx-auto flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">

            <input
              type="text"
              placeholder="Ask anything..."
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-500"
            />

            <button className="w-11 h-11 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 flex items-center justify-center hover:opacity-90 transition">
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}