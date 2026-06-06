import jwt from "jsonwebtoken";

// Access token — short lived (15 min)
export const generateAccessToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Refresh token — long lived (7 days)
export const generateRefreshToken = (user) =>
  jwt.sign({ id: user._id }, process.env.REFRESH_SECRET, { expiresIn: "7d" });

// Email verification token (24 hrs)
export const generateEmailToken = (user) =>
  jwt.sign({ email: user.email }, process.env.EMAIL_SECRET ?? process.env.JWT_SECRET, {
    expiresIn: "24h",
  });