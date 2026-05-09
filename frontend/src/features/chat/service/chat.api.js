import axios from "axios";

export const chatApi = axios.create({
  baseURL: `${import.meta.env.VITE_SERVER_URI}/api/chats`,
  withCredentials: true,
});

// ── API calls ──────────────────────────────────────────────────────────────
export const fetchUserChats    = ()               => chatApi.get("/");
export const fetchChatMessages = (chatId)         => chatApi.get(`/${chatId}/messages`);
export const sendMessageApi    = (message, chatId) => chatApi.post("/message", { message, ...(chatId && { chat: chatId }) });
export const deleteChatApi     = (chatId)         => chatApi.delete(`/${chatId}`);