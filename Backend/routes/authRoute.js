import express from "express";
import {
  register,
  login,
  logout,
  getMe,
  verifyEmail,
  resendVerification,
  refreshToken,
} from "../controllers/authcontroller.js";
import { authenticate } from "../middlewares/auth.js";

export const authrouter = express.Router();

authrouter.post("/register",            register);
authrouter.post("/login",               login);
authrouter.post("/logout",              logout);
authrouter.post("/refresh",             refreshToken);   // no authenticate here
authrouter.get ("/me",    authenticate, getMe);
authrouter.get ("/verify-email",        verifyEmail);
authrouter.post("/resend-verification", resendVerification);