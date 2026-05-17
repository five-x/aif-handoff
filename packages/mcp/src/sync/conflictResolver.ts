import { logger } from "@aif/shared";
import type { ConflictResolution } from "@aif/shared";

const log = logger("mcp:conflict");

export interface ConflictCheckInput {
  sourceTimestamp: string;
  targetTimestamp: string;
  field: string;
}

/**
 * Last-write-wins conflict resolution.
 * Compares source timestamp against target (Handoff task's updatedAt).
 */
export function resolveConflict(input: ConflictCheckInput): ConflictResolution {
  const sourceTime = new Date(input.sourceTimestamp).getTime();
  const targetTime = new Date(input.targetTimestamp).getTime();

  // Invalid or epoch-zero source timestamps are not authoritative and must not
  // be promoted to server time; the target wins without modifying task state.
  if (Number.isNaN(sourceTime) || sourceTime <= 0) {
    log.warn({ ...input, winner: "target" }, "Invalid source timestamp loses conflict");
    return {
      applied: false,
      conflict: true,
      winner: "target",
      sourceTimestamp: input.sourceTimestamp,
      targetTimestamp: input.targetTimestamp,
      field: input.field,
    };
  }

  if (sourceTime >= targetTime) {
    log.debug({ ...input, winner: "source" }, "Conflict resolved: source wins");
    return {
      applied: true,
      conflict: false,
      winner: "source",
      sourceTimestamp: input.sourceTimestamp,
      targetTimestamp: input.targetTimestamp,
      field: input.field,
    };
  }

  log.warn({ ...input, winner: "target" }, "Conflict detected: target is newer");
  return {
    applied: false,
    conflict: true,
    winner: "target",
    sourceTimestamp: input.sourceTimestamp,
    targetTimestamp: input.targetTimestamp,
    field: input.field,
  };
}
