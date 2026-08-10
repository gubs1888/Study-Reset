import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URI, {
      family: 4,
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB connected");
    return connection;
  } catch (error) {
    console.warn(`Primary MongoDB connection failed (${error.message}). Falling back to MongoMemoryServer...`);
    try {
      const { MongoMemoryServer } = await import("mongodb-memory-server");
      const memoryServer = await MongoMemoryServer.create({
        instance: { dbName: "studyreset" },
      });
      const uri = memoryServer.getUri();
      const connection = await mongoose.connect(uri, { dbName: "studyreset" });
      console.log(`MongoDB Connected (In-Memory Fallback)`);
      return connection;
    } catch (fallbackError) {
      console.error("Failed to start in-memory database:", fallbackError);
      throw error;
    }
  }
};

export default connectDB;
