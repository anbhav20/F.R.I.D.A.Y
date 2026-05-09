import jwt from "jsonwebtoken";

export const authenticate = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized.", success: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    // Distinguish expired vs tampered — frontend needs to know when to refresh
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Access token expired.",
        success: false,
        code: "TOKEN_EXPIRED",  // frontend checks this to trigger refresh
      });
    }
    return res.status(401).json({ message: "Invalid token.", success: false });
  }
};