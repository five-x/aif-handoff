import type { AuditCardDecision, TaskArtifactTrustRollup } from "@aif/shared/browser";

export interface ArtifactTrustPresentation {
  label: string;
  compactLabel: string;
  className: string;
}

export function getArtifactTrustPresentation(
  rollup: TaskArtifactTrustRollup | null | undefined,
): ArtifactTrustPresentation | null {
  if (!rollup) return null;
  const stateLabel =
    rollup.artifactState === "invalid" ? "rejected" : rollup.artifactState.replaceAll("_", " ");
  const trusted = rollup.trustedSynthesisInput && rollup.artifactTrustLevel === "trusted";
  const label =
    rollup.taskStatus === "done"
      ? trusted
        ? "Done / trusted artifact"
        : "Done / untrusted artifact"
      : `${rollup.artifactTrustLevel} artifact`;
  const compactLabel = trusted ? "trusted artifact" : `${rollup.artifactTrustLevel} ${stateLabel}`;
  const className = trusted
    ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : rollup.artifactTrustLevel === "weak"
      ? "border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "border-red-500/35 bg-red-500/15 text-red-700 dark:text-red-300";
  return { label, compactLabel, className };
}

export function formatAuditCardDecisionList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

export function getAuditCardDecisionRows(decision: AuditCardDecision): Array<[string, string]> {
  return [
    ["Final status", decision.finalStatus],
    ["Requirement completion", decision.requirementCompletion],
    ["Verification strength", decision.verificationStrength],
    ["Valid findings", String(decision.auditFindingValidity.validFindings)],
    ["Weak findings", String(decision.auditFindingValidity.weakFindings)],
    ["Discarded findings", String(decision.auditFindingValidity.discardedFindings)],
    ["Residual risks", formatAuditCardDecisionList(decision.residualRisks)],
  ];
}
