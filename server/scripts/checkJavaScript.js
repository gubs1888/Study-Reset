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
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }

  return files;
};

const roots = process.argv.includes("--all")
  ? [serverDirectory, path.join(projectDirectory, "client")]
  : [serverDirectory];
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

if (failed) process.exitCode = 1;
else console.log(`JavaScript syntax check passed for ${files.length} files.`);
