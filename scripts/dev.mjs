import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const nextBin = path.resolve(cwd, "node_modules/next/dist/bin/next");
const useTurbo = process.argv.includes("--turbo");

await rm(path.resolve(cwd, ".next"), { recursive: true, force: true });

console.log(`Starting Next from a clean .next cache${useTurbo ? " (turbopack)" : " (webpack)"}...`);

const child = spawn(process.execPath, [nextBin, "dev", ...(useTurbo ? ["--turbopack"] : [])], {
  cwd,
  env: process.env,
  stdio: "inherit"
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
