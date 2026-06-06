import {api} from "../../api"



// ── API calls ──────────────────────────────────────────────────────────────
export const fetchUserChats    = ()               => api.get("/chats/");
export const fetchChatMessages = (chatId)         => api.get(`/chats/${chatId}/messages`);
export const sendMessageApi    = (message, chatId) => api.post("/chats/message", { message, ...(chatId && { chat: chatId }) });
export const deleteChatApi     = (chatId)         => api.delete(`/chats/${chatId}`);