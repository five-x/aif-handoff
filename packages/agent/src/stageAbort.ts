/**
 * Per-task AbortController registry for concurrent coordinator stages.
 * Supports parallel task execution — each task gets its own controller.
 */

import { releaseTaskClaim, releaseTaskClaimsForCoordinator } from "@aif/data";

const _activeAborts = new Map<string, AbortController>();

export function setActiveStageAbortController(taskId: string, abort: AbortController | null): void {
  if (abort) {
    _activeAborts.set(taskId, abort);
  } else {
    _activeAborts.delete(taskId);
  }
}

export function getActiveStageAbortController(taskId?: string): AbortController | null {
  if (taskId) return _activeAborts.get(taskId) ?? null;
  // Backward compat: if only one active, return it
  if (_activeAborts.size === 1) {
    return _activeAborts.values().next().value ?? null;
  }
  return null;
}

/** Abort all active stages and release locks owned by this coordinator. */
export function abortAllActiveStages(coordinatorId: string): void {
  for (const [taskId, abort] of _activeAborts) {
    if (!abort.signal.aborted) abort.abort();
    try {
      releaseTaskClaim(taskId, coordinatorId);
    } catch {
      /* best-effort during shutdown */
    }
    _activeAborts.delete(taskId);
  }
  try {
    releaseTaskClaimsForCoordinator(coordinatorId);
  } catch {
    /* best-effort during shutdown */
  }
}
