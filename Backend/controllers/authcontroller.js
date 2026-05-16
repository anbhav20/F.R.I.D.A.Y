// authcontroller.js
import User from "../models/usermodel.js";
import jwt from "jsonwebtoken";
import admin from "../config/firebase.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../middlewares/generatetoken.js";

// ─── Cookie config ────────────────────────────────────────────────────────────
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // same raho
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // yeh fix kar
};

const ACCESS_COOKIE  = { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 };
const REFRESH_COOKIE = { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 };

// ─── Helper — issue both tokens ───────────────────────────────────────────────
const issueTokens = async (user, res) => {
  const accessToken  = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  await User.findByIdAndUpdate(user._id, { refreshToken });
  res
    .cookie("token", accessToken, ACCESS_COOKIE)
    .cookie("refreshToken", refreshToken, REFRESH_COOKIE);
  return { accessToken, refreshToken };
};

// ─── OAuth Login/Register (Google & GitHub via Firebase) ─────────────────────
export const oauthLogin = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: "ID token required.", success: false });
  }

  try {
    // Verify Firebase ID token
    const decoded = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture, firebase } = decoded;
    const provider = firebase?.sign_in_provider || "unknown"; // google.com / github.com

    // Upsert user — create if new, update if returning
    let user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      user = await User.create({
        username: name || email.split("@")[0],
        email: email.toLowerCase(),
        avatar: picture || "",
        firebaseUid: uid,
        provider,
        verified: true, // OAuth users are always verified
      });
    } else {
      // Update firebase info if missing
      if (!user.firebaseUid) {
        user.firebaseUid = uid;
        user.provider = provider;
        user.verified = true;
        if (picture && !user.avatar) user.avatar = picture;
        await user.save();
      }
    }

    await issueTokens(user, res);

    const { refreshToken: _, ...safeUser } = user.toObject();

    return res.status(200).json({
      message: "Logged in successfully.",
      success: true,
      user: safeUser,
    });
  } catch (error) {
    console.error("[oauthLogin]", error);
    if (error.code?.startsWith("auth/")) {
      return res.status(401).json({ message: "Invalid or expired token.", success: false });
    }
    return res.status(500).json({ message: "Something went wrong.", success: false });
  }
};

// ─── Refresh Token ────────────────────────────────────────────────────────────
export const refreshToken = async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) {
    return res.status(401).json({ message: "No refresh token.", success: false });
  }
  try {
    const decoded = jwt.verify(token, process.env.REFRESH_SECRET);
    const user = await User.findById(decoded.id).select("+refreshToken");
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ message: "Refresh token invalid or already used.", success: false });
    }
    await issueTokens(user, res);
    return res.status(200).json({ message: "Token refreshed.", success: true });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Refresh token expired. Please log in again.",
        success: false,
        code: "REFRESH_EXPIRED",
      });
    }
    return res.status(401).json({ message: "Invalid refresh token.", success: false });
  }
};

// ─── Get Current User ─────────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found.", success: false });
    return res.status(200).json({ message: "User fetched.", success: true, user });
  } catch (error) {
    console.error("[getMe]", error);
    return res.status(500).json({ message: "Something went wrong.", success: false });
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
export const logout = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;
    if (token) {
      const decoded = jwt.decode(token);
      if (decoded?.id) {
        await User.findByIdAndUpdate(decoded.id, { refreshToken: null });
      }
    }
  } catch { /* non-critical */ }

  return res
    .clearCookie("token", COOKIE_OPTIONS)
    .clearCookie("refreshToken", COOKIE_OPTIONS)
    .status(200)
    .json({ message: "Logged out successfully.", success: true });
};