import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../../..");

describe("docker entrypoint", () => {
  it("repairs root-owned git metadata on project mounts before dropping privileges", () => {
    const entrypoint = readFileSync(resolve(repoRoot, ".docker", "docker-entrypoint.sh"), "utf8");

    expect(entrypoint).toContain("AIF_REPAIR_PROJECT_GIT_OWNERSHIP");
    expect(entrypoint).toContain('"$projects_mount"/.git "$projects_mount"/*/.git');
    expect(entrypoint).toContain('find "$project_git_dir" -maxdepth 3');
    expect(entrypoint).toContain("\\( -user 0 -o -group 0 \\)");
    expect(entrypoint).toContain("-exec chown node:node {} +");
    expect(entrypoint.indexOf("AIF_REPAIR_PROJECT_GIT_OWNERSHIP")).toBeLessThan(
      entrypoint.indexOf("exec gosu node"),
    );
  });
});
