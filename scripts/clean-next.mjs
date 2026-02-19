import { access, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const nextDir = path.join(projectRoot, ".next");

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function cleanWithNode() {
  await rm(nextDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
}

function cleanWithCmdFallback() {
  if (process.platform !== "win32") return { ok: false, reason: "not_windows" };
  const result = spawnSync("cmd.exe", ["/c", "rmdir", "/s", "/q", nextDir], {
    stdio: "ignore",
    windowsHide: true,
  });
  return { ok: result.status === 0, reason: `exit_${result.status ?? "null"}` };
}

async function main() {
  const hasNext = await exists(nextDir);
  if (!hasNext) {
    process.stdout.write("[clean:next] .next not found, skipping\n");
    return;
  }

  try {
    await cleanWithNode();
  } catch (error) {
    const fallback = cleanWithCmdFallback();
    if (!fallback.ok) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to clean .next (${message}); fallback=${fallback.reason}`);
    }
  }

  if (await exists(nextDir)) {
    throw new Error("Failed to clean .next; directory still exists");
  }

  process.stdout.write("[clean:next] .next cleaned\n");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[clean:next] ${message}\n`);
  process.exit(1);
});
