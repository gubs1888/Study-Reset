import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let memoryServer;

export const startMemoryDatabase = async ({ databaseName = "studyreset-test" } = {}) => {
  if (memoryServer) throw new Error("The in-memory database is already running");

  memoryServer = await MongoMemoryServer.create({
    instance: { dbName: databaseName },
  });
  await mongoose.connect(memoryServer.getUri(), { dbName: databaseName });

  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );

  return memoryServer;
};

export const clearMemoryDatabase = async () => {
  if (mongoose.connection.readyState !== 1) return;

  await Promise.all(
    Object.values(mongoose.connection.collections)
      .map((collection) => collection.deleteMany({})),
  );
};

export const stopMemoryDatabase = async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
  memoryServer = undefined;
};
