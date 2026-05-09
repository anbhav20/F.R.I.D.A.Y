import express  from "express"
import { deleteChat, getChatMessages, getUserChats, sendMessage } from "../controllers/chatcontroller.js"
import { authenticate } from "../middlewares/auth.js"

export const chatRoute = express.Router()

chatRoute.post('/message', authenticate, sendMessage)
chatRoute.get('/', authenticate, getUserChats)
chatRoute.get('/:chatId/messages', authenticate, getChatMessages)
chatRoute.delete('/:chatId', authenticate, deleteChat )