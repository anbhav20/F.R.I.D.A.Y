import User from "../models/usermodel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  generateAccessToken,
  generateEmailToken,
  generateRefreshToken,
} from "../middlewares/generatetoken.js";
import { sendEmail } from "../utils/nodemailer.js";

// ─── Cookie config ────────────────────────────────────────────────────────────
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
};

const ACCESS_COOKIE = { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 }; // 15 min
const REFRESH_COOKIE = { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 }; // 7 days

// ─── Helpers ──────────────────────────────────────────────────────────────────
const buildVerifyUrl = (user) => {
  const token = generateEmailToken(user);
  return `${process.env.CLIENT_URL}/verify-email?token=${token}`;
};

const verificationEmailHtml = (username, verifyUrl) => `
  <h1>Hi ${username},</h1>
  <p>Thanks for signing up! Please verify your email address by clicking the button below.</p>
  <p>This link expires in <strong>24 hours</strong>.</p>
  <a href="${verifyUrl}" style="
    display:inline-block;padding:12px 24px;background:#4F46E5;
    color:#fff;text-decoration:none;border-radius:6px;font-weight:600;
  ">Verify Email</a>
  <p style="margin-top:16px;color:#666;font-size:12px;">
    If you didn't create this account, you can safely ignore this email.
  </p>
`;

// Issues both tokens, saves refresh token to DB, sets both cookies
const issueTokens = async (user, res) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store refresh token in DB — lets us invalidate it on logout
  await User.findByIdAndUpdate(user._id, { refreshToken });

  res
    .cookie("token", accessToken, ACCESS_COOKIE)
    .cookie("refreshToken", refreshToken, REFRESH_COOKIE);

  return { accessToken, refreshToken };
};

// ─── Register ─────────────────────────────────────────────────────────────────
export const register = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const isExist = await User.findOne({ email: email.toLowerCase() });
    if (isExist) {
      return res.status(409).json({
        message: "An account with this email already exists.",
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
     sendEmail(
      user.email,
      "Verify your email — Welcome!",
      verificationEmailHtml(user.username, verifyUrl),
    ).catch((err)=>console.error("register, email failed", err))

    return res.status(201).json({
      message: "Account created! Please check your email to verify.",
      success: true,
    });
  } catch (error) {
    console.error("[register]", error);
    return res
      .status(500)
      .json({ message: "Something went wrong.", success: false });
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────
export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password +refreshToken",
    );

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res
        .status(401)
        .json({ message: "Invalid email or password.", success: false });
    }
    if (!user.verified) {
      return res.status(403).json({
        message: "Please verify your email before logging in.",
        success: false,
      });
    }

    await issueTokens(user, res);

    // Don't send password/refreshToken to client
    const { password: _, refreshToken: __, ...safeUser } = user.toObject();

    return res
      .status(200)
      .json({
        message: "Logged in successfully.",
        success: true,
        user: safeUser,
      });
  } catch (error) {
    console.error("[login]", error);
    return res
      .status(500)
      .json({ message: "Something went wrong.", success: false });
  }
};

// ─── Refresh Token ────────────────────────────────────────────────────────────
// Frontend calls this when it gets { code: "TOKEN_EXPIRED" } from any API
export const refreshToken = async (req, res) => {
  const token = req.cookies.refreshToken;

  if (!token) {
    return res
      .status(401)
      .json({ message: "No refresh token.", success: false });
  }

  try {
    // Verify the refresh token signature
    const decoded = jwt.verify(token, process.env.REFRESH_SECRET);

    // Check it matches what's stored in DB (prevents reuse after logout)
    const user = await User.findById(decoded.id).select("+refreshToken");
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({
        message: "Refresh token invalid or already used.",
        success: false,
      });
    }

    // Issue fresh tokens (rotation — old refresh token becomes invalid)
    await issueTokens(user, res);

    return res.status(200).json({ message: "Token refreshed.", success: true });
  } catch (error) {
    console.error("[refreshToken]", error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Refresh token expired. Please log in again.",
        success: false,
        code: "REFRESH_EXPIRED",
      });
    }
    return res
      .status(401)
      .json({ message: "Invalid refresh token.", success: false });
  }
};

// ─── Get Current User ─────────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found.", success: false });
    }
    return res
      .status(200)
      .json({ message: "User fetched.", success: true, user });
  } catch (error) {
    console.error("[getMe]", error);
    return res
      .status(500)
      .json({ message: "Something went wrong.", success: false });
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
export const logout = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;
    if (token) {
      // Decode without verifying (we just need the id to clear the DB token)
      const decoded = jwt.decode(token);
      if (decoded?.id) {
        await User.findByIdAndUpdate(decoded.id, { refreshToken: null });
      }
    }
  } catch {
    // Non-critical — still clear cookies
  }

  return res
    .clearCookie("token", COOKIE_OPTIONS)
    .clearCookie("refreshToken", COOKIE_OPTIONS)
    .status(200)
    .json({ message: "Logged out successfully.", success: true });
};

// ─── Verify Email ─────────────────────────────────────────────────────────────
export const verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    // No token → just send to login, can't do much
    return res.redirect(`${process.env.CLIENT_URL}/login`);
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.EMAIL_SECRET ?? process.env.JWT_SECRET,
    );
    const user = await User.findOne({ email: decoded.email });

    if (!user) {
      // Invalid token but don't crash — send to login
      return res.redirect(`${process.env.CLIENT_URL}/login`);
    }

    if (!user.verified) {
      user.verified = true;
      await user.save();
    }

    // Always issue tokens and redirect to /chat — whether first verify or re-click
    await issueTokens(user, res);
    return res.redirect(`${process.env.CLIENT_URL}/chat`);
  } catch (error) {
    console.error("[verifyEmail]", error);

    if (error.name === "TokenExpiredError") {
      // Token expired → send to login with a query param so frontend can show message
      return res.redirect(`${process.env.CLIENT_URL}/login?verify=expired`);
    }

    return res.redirect(`${process.env.CLIENT_URL}/login?verify=invalid`);
  }
};

// ─── Resend Verification ──────────────────────────────────────────────────────
export const resendVerification = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res
      .status(400)
      .json({ message: "Email is required.", success: false });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.verified) {
      return res.status(200).json({
        message:
          "If that email exists and is unverified, a new link has been sent.",
        success: true,
      });
    }

    const verifyUrl = buildVerifyUrl(user);
    await sendEmail(
      user.email,
      "Resend: Verify your email",
      verificationEmailHtml(user.username, verifyUrl),
    );

    return res.status(200).json({
      message:
        "If that email exists and is unverified, a new link has been sent.",
      success: true,
    });
  } catch (error) {
    console.error("[resendVerification]", error);
    return res
      .status(500)
      .json({ message: "Something went wrong.", success: false });
  }
};
