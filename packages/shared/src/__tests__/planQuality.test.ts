import { describe, expect, it } from "vitest";
import {
  TaskPlanQualityError,
  buildDeterministicDiagnosticPlan,
  evaluateTaskPlanQuality,
  formatTaskPlanQualityBlockedReason,
} from "../planQuality.js";

describe("evaluateTaskPlanQuality", () => {
  it("accepts a focused checklist plan for a simple task", () => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Update navbar copy", description: "Use the existing component." },
      plan: "## Plan\n- [ ] Update the navbar copy in the existing component\n- [ ] Run the focused UI test",
    });

    expect(result.ok).toBe(true);
    expect(result.categories).toEqual([]);
  });

  it("rejects slash fallback echo and thinking artifacts", () => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Add audit report" },
      plan: "Short task\n/aif-plan fast @.ai-factory/PLAN.md docs:false tests:false\n</think>",
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toEqual(
      expect.arrayContaining(["placeholder_plan", "slash_fallback_echo", "thinking_artifact"]),
    );
  });

  it.each(["Do task", "Implement task"])("rejects generic checklist item text: %s", (itemText) => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Planner quality task" },
      plan: `## Plan\n- [ ] ${itemText}\n- [ ] Run tests`,
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("generic_plan");
  });

  it("does not treat implementation tasks mentioning review validation or verification as diagnostic", () => {
    for (const title of [
      "Fix review comment rendering",
      "Fix validation error display",
      "Add verification status badge",
    ]) {
      const result = evaluateTaskPlanQuality({
        task: { title, description: "Implementation task." },
        plan: "## Plan\n- [ ] Update the targeted UI behavior\n- [ ] Run the focused regression tests",
      });

      expect(result.ok).toBe(true);
      expect(result.categories).not.toContain("missing_diagnostic_report_constraints");
    }
  });

  it("requires task-mentioned repository paths to stay in the plan", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Patch planner",
        description: "Touch packages/agent/src/subagents/planner.ts and add tests.",
      },
      plan: "## Plan\n- [ ] Update the planner behavior\n- [ ] Run tests",
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("missing_task_specific_artifact_path");
    expect(result.issues[0]?.message).toContain("packages/agent/src/subagents/planner.ts");
  });

  it("requires diagnostic report path and diagnostic-only constraints", () => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Audit planner output quality", description: "Discovery task." },
      plan: "## Plan\n- [ ] Inspect planner and plan-checker code\n- [ ] Summarize findings",
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("missing_diagnostic_report_constraints");
  });

  it.each(["security-review", "code-review", "validation-report", "verification-findings"])(
    "requires diagnostic constraints for hyphenated diagnostic task names: %s",
    (title) => {
      const result = evaluateTaskPlanQuality({
        task: { title },
        plan: "## Plan\n- [ ] Inspect the target behavior\n- [ ] Summarize the outcome",
      });

      expect(result.ok).toBe(false);
      expect(result.categories).toContain("missing_diagnostic_report_constraints");
    },
  );

  it.each(["audit-logging", "security-review", "tests", "coverage", "build", "add-checkout"])(
    "does not apply legacy diagnostic constraints to explicit general task alias %s",
    (roadmapAlias) => {
      const result = evaluateTaskPlanQuality({
        task: {
          title: "Add audit logging",
          description: "Capture security review events and test coverage notes.",
          taskIntent: "general",
          roadmapAlias,
          tags: [`rm:${roadmapAlias}`, "kind:general"],
        },
        plan: "## Plan\n- [ ] Update the targeted implementation path\n- [ ] Run the focused regression tests",
      });

      expect(result.ok).toBe(true);
      expect(result.categories).not.toContain("missing_diagnostic_report_constraints");
    },
  );

  it("detects diagnostic plans that implement fixes in the same run", () => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Audit planner output quality" },
      plan: [
        "## Plan",
        "- [ ] Write findings to docs/reports/planner-audit.md",
        "- [ ] Keep this diagnostic-only",
        "- [ ] Implement fixes for the findings",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("diagnostic_scope_violation");
  });

  it("builds a valid deterministic fallback for diagnostic tasks with report paths", () => {
    const task = {
      title: "Audit",
      description:
        "Diagnostic only. Do not implement fixes. Write the report to audit/2026-05-08-initial-audit.md.",
    };
    const plan = buildDeterministicDiagnosticPlan({
      task,
      extraText: ["</think>\n<aif-plan fast @.ai-factory/PLAN.md docs:false tests:false"],
    });

    expect(plan).toContain("Diagnostic-only plan");
    expect(plan).toContain("audit/2026-05-08-initial-audit.md");
    expect(plan).toContain("- [ ] Keep the run diagnostic-only");
    expect(plan).not.toContain("<aif-plan");
    expect(evaluateTaskPlanQuality({ task, plan }).ok).toBe(true);
  });

  it("formats typed errors with categories", () => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Task" },
      plan: "do it",
    });
    const error = new TaskPlanQualityError(result);

    expect(formatTaskPlanQualityBlockedReason(result)).toContain("Plan quality guard");
    expect(error.message).toContain("generic_plan");
  });
});
