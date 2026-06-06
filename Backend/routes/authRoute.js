import express from "express";
import {
  oauthLogin,
  logout,
  getMe,
  refreshToken,
} from "../controllers/authcontroller.js";
import { authenticate } from "../middlewares/auth.js";

export const authrouter = express.Router();

authrouter.post("/oauth",   oauthLogin);              // Google & GitHub dono
authrouter.post("/logout",  logout);
authrouter.post("/refresh", refreshToken);
authrouter.get ("/me",      authenticate, getMe);

