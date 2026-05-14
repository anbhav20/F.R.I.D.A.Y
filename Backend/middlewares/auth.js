import jwt from "jsonwebtoken";

export const authenticate = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({
      message: "Access token missing.",
      success: false,
      code: "TOKEN_EXPIRED",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Access token expired.",
        success: false,
        code: "TOKEN_EXPIRED",
      });
    }
    return res.status(401).json({
      message: "Invalid token.",
      success: false,
      code: "TOKEN_INVALID",
    });
  }
};