import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import { createApp } from "./app.js";

dotenv.config({ quiet: true });

const validateEnvironment = () => {
  const requiredEnvironment = ["MONGO_URI", "JWT_SECRET"];
  if (process.env.NODE_ENV === "production") requiredEnvironment.push("CLIENT_ORIGIN");
  const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
  if (missingEnvironment.length) {
    throw new Error(`Missing required environment variables: ${missingEnvironment.join(", ")}`);
  }
  if (process.env.NODE_ENV === "production" && process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters in production");
  }
  if (process.env.PORT) {
    const port = Number(process.env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("PORT must be an integer between 1 and 65535");
    }
  }
};

export const startServer = async () => {
  validateEnvironment();
  await connectDB();

  const app = createApp();
  const port = Number(process.env.PORT) || 5000;
  const server = app.listen(port, () => {
    console.log(`StudyReset is running on port ${port}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; shutting down`);

    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    server.close(async () => {
      await mongoose.disconnect();
      clearTimeout(forceExit);
      process.exit(0);
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  return server;
};

const isEntryPoint = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  startServer().catch((error) => {
    console.error(`Unable to start StudyReset: ${error.message}`);
    process.exit(1);
  });
}
