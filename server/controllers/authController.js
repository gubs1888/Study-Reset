import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { createPasswordResetToken, hashPasswordResetToken } from "../services/passwordReset.js";

const generateToken = (user) => {
  return jwt.sign(
    { userId: user._id, tokenVersion: user.authTokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Register a new user
export const registerUser = async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ message: "A JSON request body is required" });
    }
    const { name, email, password } = req.body;

    if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string" || !name.trim() || !email.trim()) {
      return res.status(400).json({
        message: "Name, email, and password are required",
      });
    }

    if (name.trim().length > 80 || email.trim().length > 254) {
      return res.status(400).json({ message: "Name or email is too long" });
    }

    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({
        message: "Password must contain between 6 and 128 characters",
      });
    }

    if (!emailPattern.test(email.trim())) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    res.status(201).json({
      message: "Registration successful",
      token: generateToken(user),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    console.error("Registration error:", error.message);

    if (error?.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    return res.status(500).json({
      message: "Unable to register user",
    });
  }
};

// Log in an existing user
export const loginUser = async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ message: "A JSON request body is required" });
    }
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+authTokenVersion");

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    res.json({
      message: "Login successful",
      token: generateToken(user),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    res.status(500).json({
      message: "Unable to log in",
    });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    if (!isPlainObject(req.body) || typeof req.body.email !== "string") {
      return res.status(400).json({ message: "A valid email address is required" });
    }

    const email = req.body.email.trim().toLowerCase();
    if (email.length > 254 || !emailPattern.test(email)) {
      return res.status(400).json({ message: "A valid email address is required" });
    }

    const user = await User.findOne({ email });
    let testToken;
    if (user) {
      const reset = createPasswordResetToken();
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            resetPasswordTokenHash: reset.tokenHash,
            resetPasswordExpiresAt: reset.expiresAt,
          },
        }
      );
      if (process.env.NODE_ENV === "test") testToken = reset.token;
    }

    const response = {
      message: "If an account exists for that email, password-reset instructions will be sent.",
      deliveryConfigured: false,
    };
    if (testToken) response.resetToken = testToken;
    return res.status(202).json(response);
  } catch (error) {
    console.error("Forgot password error:", error.message);
    return res.status(500).json({ message: "Unable to request a password reset" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ message: "A JSON request body is required" });
    }

    const { token, password, confirmPassword } = req.body;
    if (typeof token !== "string" || token.length < 32 || token.length > 256) {
      return res.status(400).json({ message: "Reset token is invalid" });
    }
    if (typeof password !== "string" || password.length < 6 || password.length > 128) {
      return res.status(400).json({ message: "Password must contain between 6 and 128 characters" });
    }
    if (typeof confirmPassword !== "string" || confirmPassword !== password) {
      return res.status(400).json({ message: "Password confirmation does not match" });
    }

    const tokenHash = hashPasswordResetToken(token);
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.findOneAndUpdate(
      {
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpiresAt: { $gt: new Date() },
      },
      {
        $set: {
          passwordHash,
          passwordChangedAt: new Date(),
        },
        $unset: {
          resetPasswordTokenHash: 1,
          resetPasswordExpiresAt: 1,
        },
        $inc: { authTokenVersion: 1 },
      },
      { returnDocument: "after", runValidators: true }
    );

    if (!user) {
      return res.status(400).json({ message: "Reset token is invalid or has expired" });
    }

    return res.json({ message: "Password reset successful. You can now log in." });
  } catch (error) {
    console.error("Reset password error:", error.message);
    return res.status(500).json({ message: "Unable to reset password" });
  }
};
