import { isAbsolute } from "node:path";
import type { TaskStatus } from "@aif/shared";
import { validationError } from "../middleware/errorHandler.js";

export const PLANNING_COMPATIBLE_STATUSES = new Set<TaskStatus>([
  "backlog",
  "planning",
  "plan_ready",
]);

export function assertPlanningCompatiblePlanMutation(status: TaskStatus): void {
  if (!PLANNING_COMPATIBLE_STATUSES.has(status)) {
    throw validationError(`Cannot mutate plan while task is ${status}`, {
      status: ["Plan mutations are only allowed for backlog, planning, or plan_ready tasks"],
    });
  }
}

export function validateSafeRelativeArtifactPath(value: string | undefined): void {
  if (value === undefined) return;
  const normalized = value.replaceAll("\\", "/").trim();
  const parts = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized !== value ||
    normalized.includes("\0") ||
    normalized.includes(":") ||
    normalized.startsWith("/") ||
    isAbsolute(normalized) ||
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw validationError("planPath must be a safe relative artifact path", {
      planPath: [
        "Use a relative path within the project without absolute roots, drive letters, colons, empty segments, '.', or '..'",
      ],
    });
  }
}
