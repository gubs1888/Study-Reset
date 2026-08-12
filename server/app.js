import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/authRoutes.js";
import subjectRoutes from "./routes/subjectRoutes.js";
import studyTaskRoutes from "./routes/studyTaskRoutes.js";
import focusSessionRoutes from "./routes/focusSessionRoutes.js";
import topicRoutes from "./routes/topicRoutes.js";
import examRoutes from "./routes/examRoutes.js";
import checkInRoutes from "./routes/checkInRoutes.js";
import dailyPlanRoutes from "./routes/dailyPlanRoutes.js";
import { rateLimit } from "./middleware/rateLimit.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(currentDirectory, "../client/dist");
const rawClientDirectory = path.resolve(currentDirectory, "../client");
const defaultClientDirectory = fs.existsSync(path.join(distDirectory, "index.html"))
  ? distDirectory
  : rawClientDirectory;


const securityHeaders = (_req, res, next) => {
  const isProd = process.env.NODE_ENV === "production";
  res.set({
    "Content-Security-Policy": `default-src 'self'; base-uri 'self'; connect-src 'self'; form-action 'self'; frame-ancestors ${isProd ? "'none'" : "*"}; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'`,
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (isProd) {
    res.set("Cross-Origin-Opener-Policy", "same-origin");
    res.set("X-Frame-Options", "DENY");
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
};

const corsOptions = () => {
  const configuredOrigins = (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowUnconfiguredDevelopmentOrigin = process.env.NODE_ENV !== "production" && configuredOrigins.length === 0;

  return {
    origin(origin, callback) {
      if (!origin || allowUnconfiguredDevelopmentOrigin || configuredOrigins.includes(origin)) {
        return callback(null, true);
      }
      const error = new Error("Origin is not allowed");
      error.status = 403;
      return callback(error);
    },
  };
};

export const createApp = ({ clientDirectory = defaultClientDirectory } = {}) => {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

  app.use(securityHeaders);
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: "100kb" }));

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    maximum: process.env.NODE_ENV === "test" ? 1000 : 30,
    message: "Too many authentication attempts. Please try again later.",
  });

  app.get("/api/health", (_req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    res.status(databaseReady ? 200 : 503).json({
      status: databaseReady ? "ok" : "not-ready",
      service: "StudyReset API",
      database: databaseReady ? "connected" : "disconnected",
    });
  });
  app.use("/api/auth", authRateLimit, authRoutes);
  app.use("/api/subjects", subjectRoutes);
  app.use("/api/tasks", studyTaskRoutes);
  app.use("/api/focus-sessions", focusSessionRoutes);
  app.use("/api/topics", topicRoutes);
  app.use("/api/exams", examRoutes);
  app.use("/api/check-ins", checkInRoutes);
  app.use("/api/plans", dailyPlanRoutes);

  app.use(express.static(clientDirectory, {
    etag: true,
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
    setHeaders(response, filePath) {
      if (path.basename(filePath) === "index.html") {
        response.set("Cache-Control", "no-cache");
      }
    },
  }));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
      res.set("Cache-Control", "no-cache");
      return res.sendFile(path.join(clientDirectory, "index.html"));
    }
    return next();
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "API route not found" });
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === "entity.parse.failed") {
      return res.status(400).json({ message: "Request body must contain valid JSON" });
    }
    if (error?.type === "entity.too.large") {
      return res.status(413).json({ message: "Request body is too large" });
    }

    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
    if (status === 500) console.error("Unhandled request error:", error?.message || "Unknown error");
    return res.status(status).json({
      message: status === 500 ? "Unexpected server error" : error.message,
    });
  });

  return app;
};

export default createApp;
