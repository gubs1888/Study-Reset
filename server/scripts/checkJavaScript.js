import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(scriptDirectory, "..");
const projectDirectory = path.resolve(serverDirectory, "..");
const ignoredDirectories = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const collectJavaScript = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await collectJavaScript(entryPath));
      }
    } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".cjs") || entry.name.endsWith(".mjs")) && !entryPath.includes("/client/")) {
      files.push(entryPath);
    }
  }

  return files;
};

const roots = [serverDirectory];
const files = (await Promise.all(roots.map(collectJavaScript)))
  .flat()
  .sort((left, right) => left.localeCompare(right));

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: projectDirectory,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`JavaScript syntax check failed: ${path.relative(projectDirectory, file)}\n`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

if (process.argv.includes("--all")) {
  const clientBuildResult = spawnSync("npm", ["run", "build"], {
    cwd: path.join(projectDirectory, "client"),
    encoding: "utf8",
  });
  if (clientBuildResult.status !== 0) {
    failed = true;
    process.stderr.write("Client React build check failed:\n");
    if (clientBuildResult.stdout) process.stderr.write(clientBuildResult.stdout);
    if (clientBuildResult.stderr) process.stderr.write(clientBuildResult.stderr);
    if (
      (clientBuildResult.stderr && clientBuildResult.stderr.includes("vite: not found")) ||
      (clientBuildResult.stdout && clientBuildResult.stdout.includes("vite: not found"))
    ) {
      process.stderr.write("\nHint: Client dependencies are missing. Run 'npm run setup' (or 'npm ci --prefix client') to install them.\n");
    }
  }
}

if (failed) process.exitCode = 1;
else console.log(`JavaScript syntax check passed for ${files.length} server files${process.argv.includes("--all") ? " and React client build" : ""}.`);

