import express from 'express';
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { authrouter } from '../routes/authRoute.js';
import { chatRoute } from '../routes/chatRoute.js';

const app = express();

app.use(helmet()); // Set security-related HTTP headers in one line

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authrouter);
app.use('/api/chats', chatRoute)

export default app;