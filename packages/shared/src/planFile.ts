import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { getProjectConfig } from "./projectConfig.js";

// Re-export browser-safe functions for backward compatibility
export { slugify, generatePlanPath } from "./planPath.js";
export type { GeneratePlanPathOptions } from "./planPath.js";

// --- Node.js-dependent functions ---

interface CanonicalPlanInput {
  projectRoot: string;
  isFix: boolean;
  planPath?: string;
}

interface SyncCanonicalPlanInput extends CanonicalPlanInput {
  planText: string | null;
}

export function getCanonicalPlanPath(input: CanonicalPlanInput): string {
  const cfg = getProjectConfig(input.projectRoot);
  const canonicalPath = input.isFix
    ? resolve(input.projectRoot, cfg.paths.fix_plan)
    : resolve(input.projectRoot, input.planPath || cfg.paths.plan);
  const relativePath = relative(input.projectRoot, canonicalPath);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Plan path must resolve within the project root");
  }
  return canonicalPath;
}

export function syncPlanTextToCanonicalFile(input: SyncCanonicalPlanInput): string {
  const canonicalPath = getCanonicalPlanPath(input);
  mkdirSync(dirname(canonicalPath), { recursive: true });
  const normalized = (input.planText ?? "").trimEnd();
  writeFileSync(canonicalPath, `${normalized}\n`, "utf8");
  return canonicalPath;
}
