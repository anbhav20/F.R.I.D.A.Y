import User from "../models/usermodel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  generateAccessToken,
  generateEmailToken,
  generateRefreshToken,
} from "../middlewares/generatetoken.js";
import { sendEmail } from "../utils/nodemailer.js";

// ─── Helpers ────────────────────────────────────────────────────────────
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
};

const buildVerifyUrl = (user) => {
  const token = generateEmailToken(user);
  return `${process.env.CLIENT_URL}/verify-email?token=${token}`;
};

const verificationEmailHtml = (username, verifyUrl) => `
  <h1>Hi ${username},</h1>
  <p>Thanks for signing up! Please verify your email address by clicking the button below.</p>
  <p>This link expires in <strong>24 hours</strong>.</p>
  <a href="${verifyUrl}" style="
    display:inline-block;
    padding:12px 24px;
    background:#4F46E5;
    color:#fff;
    text-decoration:none;
    border-radius:6px;
    font-weight:600;
  ">Verify Email</a>
  <p style="margin-top:16px;color:#666;font-size:12px;">
    If you didn't create this account, you can safely ignore this email.
  </p>
`;

// ─── Register ──────────────────────────────────────────────────────────────

export const register = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const isExist = await User.findOne({ email: email.toLowerCase() });
    if (isExist) {
      return res.status(409).json({
        message: "An account with this email already exists. Please log in.",
        success: false,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      username: username.trim(),
      email: email.toLowerCase(),
      password: hashedPassword,
    });

    const verifyUrl = buildVerifyUrl(user);
    await sendEmail(
      user.email,
      "Verify your email — Welcome to Perplexity!",
      verificationEmailHtml(user.username, verifyUrl)
    );

    return res.status(201).json({
      message: "Account created! Please check your email to verify your account.",
      success: true,
      user,
    });
  } catch (error) {
    console.error("[register]", error);
    return res.status(500).json({
      message: "Something went wrong. Please try again later.",
      success: false,
    });
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────

export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    // Single message to prevent user enumeration
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        message: "Invalid email or password.",
        success: false,
      });
    }

    if (!user.verified) {
      return res.status(403).json({
        message: "Please verify your email before logging in. Check your inbox.",
        success: false,
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return res
      .cookie("token", accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 })
      .cookie("refreshToken", refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 })
      .status(200)
      .json({ message: "Logged in successfully.", success: true, user });
  } catch (error) {
    console.error("[login]", error);
    return res.status(500).json({
      message: "Something went wrong. Please try again later.",
      success: false,
    });
  }
};

// ─── Get Current User ─────────────────────────────────────────────────────────

export const getMe = async (req, res) => {

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found.", success: false });
    }
    return res.status(200).json({ message: "User fetched successfully.", success: true, user });
  } catch (error) {
    console.error("[getMe]", error);
    return res.status(500).json({
      message: "Something went wrong. Please try again later.",
      success: false,
    });
  }
};

// ─── Verify Email ─────────────────────────────────────────────────────────────
// Flow: user clicks link → we verify → set auth cookies → redirect to dashboard
// User lands on dashboard already logged in, no need to log in again.

export const verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.redirect(`${process.env.CLIENT_URL}/verify-failed?reason=missing`);
  }

  try {
    const decoded = jwt.verify(token, process.env.EMAIL_SECRET ?? process.env.JWT_SECRET);

    const user = await User.findOne({ email: decoded.email });
    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL}/verify-failed?reason=invalid`);
    }

    // Already verified — just drop them on the dashboard (they may have clicked the link twice)
    if (user.verified) {
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);
      return res
        .cookie("token", accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 })
        .cookie("refreshToken", refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 })
        .redirect(`${process.env.CLIENT_URL}/chat`);
    }

    // First time verifying — mark verified, issue tokens, redirect to dashboard
    user.verified = true;
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return res
      .cookie("token", accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 })
      .cookie("refreshToken", refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 })
      .redirect(`${process.env.CLIENT_URL}/`);

  } catch (error) {
    console.error("[verifyEmail]", error);

    if (error.name === "TokenExpiredError") {
      return res.redirect(`${process.env.CLIENT_URL}/verify-failed?reason=expired`);
    }
    if (error.name === "JsonWebTokenError") {
      return res.redirect(`${process.env.CLIENT_URL}/verify-failed?reason=invalid`);
    }

    return res.redirect(`${process.env.CLIENT_URL}/verify-failed?reason=server`);
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = async (req, res) => {
  return res
    .clearCookie("token", COOKIE_OPTIONS)
    .clearCookie("refreshToken", COOKIE_OPTIONS)
    .status(200)
    .json({ message: "Logged out successfully.", success: true });
};

// ─── Resend Verification Email ────────────────────────────────────────────────

export const resendVerification = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required.", success: false });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return the same response to prevent email enumeration
    if (!user || user.verified) {
      return res.status(200).json({
        message: "If that email exists and is unverified, a new link has been sent.",
        success: true,
      });
    }

    const verifyUrl = buildVerifyUrl(user);
    await sendEmail(
      user.email,
      "Resend: Verify your email — Perplexity",
      verificationEmailHtml(user.username, verifyUrl)
    );

    return res.status(200).json({
      message: "If that email exists and is unverified, a new link has been sent.",
      success: true,
    });
  } catch (error) {
    console.error("[resendVerification]", error);
    return res.status(500).json({
      message: "Something went wrong. Please try again later.",
      success: false,
    });
  }
};