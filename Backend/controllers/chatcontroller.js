import { generateChatTitle, generateResponse } from "../utils/ai.js";
import Chat from "../models/chatmodel.js";
import Message from "../models/messagemodel.js";

const MAX_CONTEXT_MESSAGES = 20;

// ── Send a message and get AI response ───────────────────────────────────────
export const sendMessage = async (req, res) => {
  try {
    const { message, chat: chatId } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    let chat = null;
    let title = null;

    if (chatId) {
      chat = await Chat.findOne({ _id: chatId, user: req.user.id });
      if (!chat) return res.status(404).json({ error: "Chat not found." });
    } else {
      // Run title generation and chat creation in parallel
      const [generatedTitle, newChat] = await Promise.all([
        generateChatTitle(message),
        Chat.create({ user: req.user.id, title: "New Chat" }),
      ]);
      title = generatedTitle;
      newChat.title = title;
      await newChat.save();
      chat = newChat;
    }

    const resolvedChatId = chat._id;

    // Save user message
    await Message.create({
      chat: resolvedChatId,
      content: message.trim(),
      role: "user",
    });

    // Fetch bounded history (newest 20, reversed to oldest-first for model)
    const history = await Message.find({ chat: resolvedChatId })
      .sort({ createdAt: -1 })
      .limit(MAX_CONTEXT_MESSAGES)
      .lean();

    const orderedHistory = history.reverse();

    // Generate AI response
    const result = await generateResponse(orderedHistory);

    // Save AI message
    const aiMessage = await Message.create({
      chat: resolvedChatId,
      content: result,
      role: "ai",
    });

    // Bump updatedAt so chats sort by recent activity
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
      // Extra detail so we know WHY it wasn't found
      const existsAtAll = await Chat.findById(chatId).lean();
      if (!existsAtAll) {
        return res.status(404).json({ error: "Chat not found.", reason: "ID does not exist in DB." });
      }
      return res.status(403).json({ error: "Chat not found.", reason: "Chat exists but belongs to a different user." });
    }

    const messages = await Message.find({ chat: chatId }).sort({ createdAt: 1 }).lean();
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

// ── Delete a chat and its messages ────────────────────────────────────────────
export const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findOneAndDelete({ _id: chatId, user: req.user.id });
    if (!chat) return res.status(404).json({ error: "Chat not found." });

    await Message.deleteMany({ chat: chatId });
    return res.status(200).json({ message: "Chat deleted." });
  } catch (error) {
    console.error("deleteChat error:", error);
    return res.status(500).json({ error: "Failed to delete chat." });
  }
};