import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication token required",
      });
    }

    const token = authorization.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findById(
      decoded.userId
    ).select("-passwordHash +authTokenVersion");

    if (!user) {
      return res.status(401).json({
        message: "User no longer exists",
      });
    }

    if ((decoded.tokenVersion ?? 0) !== (user.authTokenVersion ?? 0)) {
      return res.status(401).json({
        message: "Authentication token is no longer valid",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired authentication token",
    });
  }
};
