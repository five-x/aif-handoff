import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const MAX_GIT_BUFFER_BYTES = 20 * 1024 * 1024;

export interface GitWorktreeReworkSnapshot {
  baselineHeadSha: string | null;
  changedFilesDigest: string;
  changedFilesSummary: string[];
}

function gitArgs(projectRoot: string, args: string[]): string[] {
  return ["-c", `safe.directory=${resolve(projectRoot)}`, ...args];
}

function runGitBuffer(projectRoot: string, args: string[]): Buffer | null {
  try {
    return execFileSync("git", gitArgs(projectRoot, args), {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: MAX_GIT_BUFFER_BYTES,
    });
  } catch {
    return null;
  }
}

function runGitText(projectRoot: string, args: string[]): string | null {
  return runGitBuffer(projectRoot, args)?.toString("utf8").trim() ?? null;
}

function parsePorcelainStatus(status: Buffer | null): string[] {
  if (!status || status.length === 0) return [];
  return status
    .toString("utf8")
    .split("\0")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 100);
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function hashUntrackedFileContents(projectRoot: string): string {
  const root = resolve(projectRoot);
  const raw = runGitBuffer(projectRoot, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const hasher = createHash("sha256");
  for (const filePath of (raw?.toString("utf8") ?? "").split("\0").filter(Boolean).sort()) {
    const absolutePath = resolve(root, filePath);
    if (!isPathInsideRoot(root, absolutePath) || !existsSync(absolutePath)) continue;
    try {
      if (!statSync(absolutePath).isFile()) continue;
      hasher.update("path\0");
      hasher.update(filePath);
      hasher.update("\0content\0");
      hasher.update(readFileSync(absolutePath));
      hasher.update("\0");
    } catch {
      hasher.update("unreadable\0");
      hasher.update(filePath);
      hasher.update("\0");
    }
  }
  return hasher.digest("hex");
}

export function readGitWorktreeReworkSnapshot(
  projectRoot: string,
): GitWorktreeReworkSnapshot | null {
  const isWorkTree = runGitText(projectRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (isWorkTree !== "true") return null;

  const baselineHeadSha = runGitText(projectRoot, ["rev-parse", "HEAD"]);
  const status = runGitBuffer(projectRoot, ["status", "--porcelain=v1", "-z"]);
  const diff =
    baselineHeadSha != null
      ? runGitBuffer(projectRoot, ["diff", "--binary", "HEAD", "--"])
      : runGitBuffer(projectRoot, ["diff", "--binary", "--"]);
  const untrackedDigest = hashUntrackedFileContents(projectRoot);

  const hasher = createHash("sha256");
  hasher.update("aif-git-worktree-rework-v1\0");
  hasher.update("head\0");
  hasher.update(baselineHeadSha ?? "none");
  hasher.update("\0status\0");
  hasher.update(status ?? Buffer.alloc(0));
  hasher.update("\0diff\0");
  hasher.update(diff ?? Buffer.alloc(0));
  hasher.update("\0untracked\0");
  hasher.update(untrackedDigest);

  return {
    baselineHeadSha,
    changedFilesDigest: hasher.digest("hex"),
    changedFilesSummary: parsePorcelainStatus(status),
  };
}
