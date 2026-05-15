import express from 'express';
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { authrouter } from '../routes/authRoute.js';
import { chatRoute } from '../routes/chatRoute.js';

const app = express();

app.use(helmet()); // Set security-related HTTP headers in one line

const allowedOrigins = [
  process.env.CLIENT_URL,
].filter(Boolean);

console.log("Allowed CORS origins:", allowedOrigins.join(", "));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    console.log("🚫 Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));


app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authrouter);
app.use('/api/chats', chatRoute)

export default app;