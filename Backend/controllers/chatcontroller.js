import { generateChatTitle, generateResponse } from "../utils/ai.js";
import Chat from "../models/chatmodel.js";
import Message from "../models/messagemodel.js";

// Recent messages sent in full — gives model strong immediate context
const MAX_RECENT_MESSAGES = 20;

// If chat has > this many messages, old ones get summarized instead of dropped
const SUMMARIZE_THRESHOLD = 40;

// ── Send a message and get AI response ───────────────────────────────────────
export const sendMessage = async (req, res) => {
  try {
    const { message, chat: chatId } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    let chat = null;
    let title = null;
    let isNewChat = false;

    if (chatId) {
      chat = await Chat.findOne({ _id: chatId, user: req.user.id });
      if (!chat) return res.status(404).json({ error: "Chat not found." });
    } else {
      // New chat: generate title and create chat in parallel
      const [generatedTitle, newChat] = await Promise.all([
        generateChatTitle(message.trim()),
        Chat.create({ user: req.user.id, title: "New Chat" }),
      ]);
      title = generatedTitle;
      newChat.title = title;
      await newChat.save();
      chat = newChat;
      isNewChat = true;
    }

    const resolvedChatId = chat._id;

    // Save user message first
    await Message.create({
      chat: resolvedChatId,
      content: message.trim(),
      role: "user",
    });

    // Fetch conversation history — get enough for context + summarization
    const totalCount = await Message.countDocuments({ chat: resolvedChatId });
    const fetchLimit = Math.min(totalCount, SUMMARIZE_THRESHOLD + MAX_RECENT_MESSAGES);

    const history = await Message.find({ chat: resolvedChatId })
      .sort({ createdAt: -1 })
      .limit(fetchLimit)
      .lean();

    // Reverse to chronological order (oldest → newest)
    const orderedHistory = history.reverse();

    console.log(
      `[Chat] ${resolvedChatId} | total=${totalCount} | fetched=${orderedHistory.length} | isNew=${isNewChat}`
    );

    // Generate AI response with full context awareness
    const result = await generateResponse(orderedHistory, {
      maxRecentMessages: MAX_RECENT_MESSAGES,
      // Trigger summarization only if we have a LOT of old messages
      oldMessagesToSummarize: totalCount > SUMMARIZE_THRESHOLD ? SUMMARIZE_THRESHOLD : 0,
    });

    // Save AI response
    const aiMessage = await Message.create({
      chat: resolvedChatId,
      content: result,
      role: "ai",
    });

    // Update chat's updatedAt so it sorts to top in sidebar
    await Chat.findByIdAndUpdate(resolvedChatId, { updatedAt: new Date() });

    return res.status(201).json({
      aiMessage: result,
      title: title ?? chat.title,
      chat,
      message: aiMessage,
    });
  } catch (error) {
    console.error("sendMessage error:", error);
    return res.status(500).json({ error: "Failed to process your message." });
  }
};

// ── Get all messages for a chat ───────────────────────────────────────────────
export const getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findOne({ _id: chatId, user: req.user.id });

    if (!chat) {
      const existsAtAll = await Chat.findById(chatId).lean();
      if (!existsAtAll) {
        return res
          .status(404)
          .json({ error: "Chat not found.", reason: "ID does not exist in DB." });
      }
      return res.status(403).json({
        error: "Access denied.",
        reason: "Chat belongs to a different user.",
      });
    }

    const messages = await Message.find({ chat: chatId })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({ messages });
  } catch (error) {
    console.error("getChatMessages error:", error);
    return res.status(500).json({ error: "Failed to fetch messages." });
  }
};

// ── Get all chats for current user ───────────────────────────────────────────
export const getUserChats = async (req, res) => {
  try {
    const chats = await Chat.find({ user: req.user.id })
      .sort({ updatedAt: -1 })
      .lean();
    return res.status(200).json({ chats });
  } catch (error) {
    console.error("getUserChats error:", error);
    return res.status(500).json({ error: "Failed to fetch chats." });
  }
};

// ── Delete a chat and all its messages ───────────────────────────────────────
export const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findOneAndDelete({ _id: chatId, user: req.user.id });
    if (!chat) return res.status(404).json({ error: "Chat not found." });

    await Message.deleteMany({ chat: chatId });
    return res.status(200).json({ message: "Chat deleted successfully." });
  } catch (error) {
    console.error("deleteChat error:", error);
    return res.status(500).json({ error: "Failed to delete chat." });
  }
};

// ── Rename a chat ─────────────────────────────────────────────────────────────
export const renameChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { title } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: "Title cannot be empty." });
    }

    const chat = await Chat.findOneAndUpdate(
      { _id: chatId, user: req.user.id },
      { title: title.trim() },
      { new: true }
    );

    if (!chat) return res.status(404).json({ error: "Chat not found." });
    return res.status(200).json({ chat });
  } catch (error) {
    console.error("renameChat error:", error);
    return res.status(500).json({ error: "Failed to rename chat." });
  }
};