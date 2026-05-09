import { useDispatch, useSelector } from "react-redux";
import { useCallback } from "react";
import {
  fetchUserChats, fetchChatMessages,
  sendMessageApi, deleteChatApi,
} from "../service/chat.api";
import {
  setChats, setActiveChat, setMessages, appendMessage,
  upsertChat, removeChat, updateChatTitle,
  setLoading, setChatsLoading, setMsgsLoading,
  setIsTyping, setChatError, clearChat,
} from "../chat.slice";

export const useChat = () => {
  const dispatch = useDispatch();
  const { chats, activeChat, messages, loading, chatsLoading, msgsLoading, isTyping, error } =
    useSelector((s) => s.chat);

  // ── Load sidebar chats ─────────────────────────────────────────────────────
  const loadChats = useCallback(async () => {
    dispatch(setChatsLoading(true));
    try {
      const { data } = await fetchUserChats();
      dispatch(setChats(data.chats));
    } catch {
      // error handled by interceptor
    } finally {
      dispatch(setChatsLoading(false));
    }
  }, [dispatch]);

  // ── Select a chat and load its messages ────────────────────────────────────
  const selectChat = useCallback(async (chat) => {
    dispatch(setActiveChat(chat));
    dispatch(setMsgsLoading(true));
    try {
      const { data } = await fetchChatMessages(chat._id);
      dispatch(setMessages(data.messages));
    } catch {
      dispatch(setMessages([]));
    } finally {
      dispatch(setMsgsLoading(false));
    }
  }, [dispatch]);

  // ── Start a new chat (clears active) ──────────────────────────────────────
  const newChat = useCallback(() => {
    dispatch(clearChat());
  }, [dispatch]);

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || loading) return;

    const chatId = activeChat?._id ?? null;

    // Optimistically add user message to UI
    dispatch(appendMessage({ role: "user", content, _id: `tmp-${Date.now()}` }));
    dispatch(setLoading(true));
    dispatch(setIsTyping(true));

    try {
      const { data } = await sendMessageApi(content, chatId);

      // If new chat was created, add it to sidebar and set as active
      if (!chatId && data.chat) {
        dispatch(upsertChat(data.chat));
        dispatch(setActiveChat(data.chat));
      }

      // Add AI response
      dispatch(appendMessage({
        role: "ai",
        content: data.aiMessage,
        _id: data.message?._id ?? `ai-${Date.now()}`,
      }));
    } catch {
      dispatch(appendMessage({
        role: "ai",
        content: "Something went wrong. Please try again.",
        _id: `err-${Date.now()}`,
        isError: true,
      }));
    } finally {
      dispatch(setLoading(false));
      dispatch(setIsTyping(false));
    }
  }, [dispatch, activeChat, loading]);

  // ── Delete chat ────────────────────────────────────────────────────────────
  const deleteChat = useCallback(async (chatId) => {
    try {
      await deleteChatApi(chatId);
      dispatch(removeChat(chatId));
      if (activeChat?._id === chatId) dispatch(clearChat());
    } catch {
      // silent
    }
  }, [dispatch, activeChat]);

  return {
    chats, activeChat, messages,
    loading, chatsLoading, msgsLoading, isTyping, error,
    loadChats, selectChat, newChat, sendMessage, deleteChat,
  };
};