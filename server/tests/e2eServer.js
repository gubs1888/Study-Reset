import { createApp } from "../app.js";
import {
  startMemoryDatabase,
  stopMemoryDatabase,
} from "./helpers/memoryDatabase.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "studyreset-browser-test-secret-at-least-32-characters";
delete process.env.CLIENT_ORIGIN;

const port = Number(process.env.TEST_PORT) || 4173;
let httpServer;
let shuttingDown = false;

const shutdown = async (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await stopMemoryDatabase();
  process.exit(exitCode);
};

try {
  await startMemoryDatabase({ databaseName: "studyreset-e2e" });
  httpServer = createApp().listen(port, "127.0.0.1", () => {
    console.log(`StudyReset browser test server listening at http://127.0.0.1:${port}`);
  });
} catch (error) {
  console.error(`Unable to start the browser test server: ${error.message}`);
  await shutdown(1);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
