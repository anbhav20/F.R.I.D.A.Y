import { createSlice } from "@reduxjs/toolkit";

const chatSlice = createSlice({
  name: "chat",
  initialState: {
    chats: [],
    activeChat: null,
    messages: [],
    loading: false,
    chatsLoading: false,
    msgsLoading: false,
    error: null,
    isTyping: false,
  },
  reducers: {
    setChats: (s, a) => { s.chats = a.payload; },

    setActiveChat: (s, a) => { s.activeChat = a.payload; s.messages = []; },

    setMessages: (s, a) => { s.messages = a.payload; },

    appendMessage: (s, a) => { s.messages.push(a.payload); },

    // ✅ Fix: don't add if chat with same _id already exists (prevents duplicate keys)
    prependChat: (s, a) => {
      const exists = s.chats.some((c) => c._id === a.payload._id);
      if (!exists) s.chats.unshift(a.payload);
    },

    // ✅ Fix: also update title if chat already exists (handles race condition)
    upsertChat: (s, a) => {
      const idx = s.chats.findIndex((c) => c._id === a.payload._id);
      if (idx !== -1) {
        s.chats[idx] = a.payload;
      } else {
        s.chats.unshift(a.payload);
      }
    },

    removeChat: (s, a) => {
      s.chats = s.chats.filter((c) => c._id !== a.payload);
    },

    updateChatTitle: (s, a) => {
      const c = s.chats.find((c) => c._id === a.payload.id);
      if (c) c.title = a.payload.title;
    },

    setLoading:      (s, a) => { s.loading      = a.payload; },
    setChatsLoading: (s, a) => { s.chatsLoading = a.payload; },
    setMsgsLoading:  (s, a) => { s.msgsLoading  = a.payload; },
    setIsTyping:     (s, a) => { s.isTyping      = a.payload; },
    setChatError:    (s, a) => { s.error         = a.payload; },

    clearChat: (s) => { s.activeChat = null; s.messages = []; },
  },
});

export const {
  setChats, setActiveChat, setMessages, appendMessage,
  prependChat, upsertChat, removeChat, updateChatTitle,
  setLoading, setChatsLoading, setMsgsLoading,
  setIsTyping, setChatError, clearChat,
} = chatSlice.actions;

export default chatSlice.reducer;