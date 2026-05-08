import express from 'express';
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { authrouter } from '../routes/authRoute.js';

const app = express();

app.use(helmet()); // Set security-related HTTP headers in one line

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authrouter);

export default app;