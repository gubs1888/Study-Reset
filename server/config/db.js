import fs from "fs";
import path from "path";
import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URI, {
      family: 4,
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB connected (Atlas Cloud)");
    return connection;
  } catch (error) {
    console.warn(`Primary MongoDB connection failed (${error.message}). Falling back to Persistent Local Database...`);
    try {
      const { MongoMemoryServer } = await import("mongodb-memory-server");
      const dbDir = path.resolve("./server/.data/db");
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      const memoryServer = await MongoMemoryServer.create({
        instance: {
          dbName: "studyreset",
          dbPath: dbDir,
          storageEngine: "wiredTiger",
        },
      });
      const uri = memoryServer.getUri();
      const connection = await mongoose.connect(uri, { dbName: "studyreset" });
      console.log(`MongoDB Connected (Persistent Local Database at ${dbDir})`);
      return connection;
    } catch (fallbackError) {
      console.error("Failed to start persistent local database:", fallbackError);
      throw error;
    }
  }
};

export default connectDB;

