import { useEffect, useRef, useState } from "react";
import {
  Menu,
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  SquarePen,
} from "lucide-react";
import { useChat } from "../hooks/useChat";
import { useSelector } from "react-redux";
import Sidebar from "../../../../components/SideBar";
import { MarkdownMessage } from "../../../../components/Markdawnmessage";

const TypingIndicator = () => (
  <div className="flex gap-3 px-4 py-3 max-w-3xl mx-auto w-full">
    <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shrink-0 mt-0.5">
      <Bot size={14} className="text-black" />
    </div>
    <div className="flex items-center gap-1 pt-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  </div>
);

const MessageBubble = ({ msg }) => {
  const isUser = msg.role === "user";
  return (
    <div
      className={`flex gap-3 px-4 py-3 max-w-3xl mx-auto w-full ${isUser ? "justify-end" : ""}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shrink-0 mt-0.5">
          <Bot size={14} className="text-black" />
        </div>
      )}
      <div
        className={`text-sm leading-relaxed max-w-[80%] ${
          isUser
            ? "bg-zinc-800 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm"
            : "text-zinc-100"
        } ${msg.isError ? "text-red-400" : ""}`}
      >
        {msg.isError ? (
          <div className="flex items-center gap-2">
            <AlertCircle size={14} />
            {msg.content}
          </div>
        ) : isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <MarkdownMessage content={msg.content} />
        )}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
          <User size={14} className="text-zinc-300" />
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ username }) => (
  <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-5">
      <Bot size={22} className="text-black" />
    </div>
    <h2 className="text-xl font-semibold text-white mb-1">
      {username ? `Hi, ${username}` : "How can I help you?"}
    </h2>
    <p className="text-zinc-500 text-sm">
      Ask me anything!!
    </p>
  </div>
);

export default function Chat() {
  const {
    chats,
    activeChat,
    messages,
    loading,
    msgsLoading,
    isTyping,
    loadChats,
    selectChat,
    newChat,
    sendMessage,
    deleteChat,
  } = useChat();

  const { user } = useSelector((s) => s.auth);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className=" h-screen  bg-[#212121] text-white flex overflow-hidden font-sans">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        chats={chats}
        activeChat={activeChat}
        onNewChat={newChat}
        onSelectChat={selectChat}
        onDeleteChat={deleteChat}
        user={user}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        {/* Top bar */}
        <div className="relative flex items-center px-3 py-2.5 border-b border-white/5 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-white/10 transition text-zinc-400 hover:text-white"
          >
            <Menu size={18} />
          </button>

          {/* Mobile title — centered */}
          <span className="lg:hidden text-sm font-semibold text-white absolute left-1/2 -translate-x-1/2 pointer-events-none">
            F.R.I.D.A.Y
          </span>

          {/* Desktop title */}
          <span className="text-sm text-zinc-400 truncate hidden lg:block">
            {activeChat?.title ?? "New Conversation"}
          </span>

          <button
            onClick={newChat}
            className="p-2 rounded-lg hover:bg-white/10 transition text-zinc-400 hover:text-white ml-auto"
            title="New chat"
          >
            <SquarePen size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 chat-scroll">
          {msgsLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={20} className="animate-spin text-zinc-600" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState username={user?.username} />
          ) : (
            <div className="space-y-1 pb-4">
              {messages.map((msg) => (
                <MessageBubble key={msg._id} msg={msg} />
              ))}
              {isTyping && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-3 sm:px-4 pb-4 pt-2 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-zinc-800 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-white/20 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  resizeTextarea();
                }}
                onKeyDown={handleKeyDown}
                placeholder="Message F.R.I.D.A.Y..."
                rows={1}
                disabled={loading}
                className="flex-1 bg-transparent h-7 outline-none text-sm text-white placeholder:text-zinc-500 resize-none leading-relaxed"
                style={{ maxHeight: "160px" }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0
                  hover:bg-zinc-200 transition disabled:opacity-20 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin text-black" />
                ) : (
                  <Send size={15} className="text-black" />
                )}
              </button>
            </div>
            <p className="text-center text-xs text-zinc-600 mt-1">
              F.R.I.D.A.Y can make mistakes. please Verify.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
