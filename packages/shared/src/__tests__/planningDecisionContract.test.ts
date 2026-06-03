import { describe, expect, it } from "vitest";
import {
  PlanningDecisionContractError,
  parseAifPlanningDecisionContract,
  stripAifPlanningDecisionBlocks,
} from "../planningDecisionContract.js";

function decisionBlock(payload: unknown): string {
  return ["```aif-planning-decision", JSON.stringify(payload, null, 2), "```"].join("\n");
}

describe("planning decision contract", () => {
  it("parses ready_plan decisions", () => {
    const decision = parseAifPlanningDecisionContract({
      taskId: "task-ready",
      text: [
        "## Plan",
        "- [ ] Update packages/shared/src/planningDecisionContract.ts.",
        decisionBlock({
          decision: "ready_plan",
          taskId: "task-ready",
          reason: "The task is narrow and has concrete verification.",
          proposedChildren: [],
        }),
      ].join("\n"),
    });

    expect(decision).toMatchObject({
      decision: "ready_plan",
      taskId: "task-ready",
      reason: "The task is narrow and has concrete verification.",
      proposedChildren: [],
    });
  });

  it("parses split_required decisions with proposed children", () => {
    const decision = parseAifPlanningDecisionContract({
      taskId: "task-split",
      text: decisionBlock({
        decision: "split_required",
        taskId: "task-split",
        reason: "The task spans unrelated frontend and backend changes.",
        proposedChildren: [
          {
            title: "Add API contract guard",
            taskIntent: "feature",
            scope: ["packages/api/src/routes/tasks.ts"],
            acceptanceCriteria: ["The API rejects invalid planner decisions."],
            verificationCommands: [
              "npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts",
            ],
            forbiddenChanges: ["Do not edit frontend components."],
          },
        ],
      }),
    });

    expect(decision.decision).toBe("split_required");
    expect(decision.proposedChildren).toHaveLength(1);
    expect(decision.proposedChildren[0]).toMatchObject({
      title: "Add API contract guard",
      taskIntent: "feature",
      scope: ["packages/api/src/routes/tasks.ts"],
    });
  });

  it("strips planning decision fences from persisted plan text", () => {
    const text = [
      "## Plan",
      "- [ ] Keep only runnable checklist content.",
      decisionBlock({
        decision: "ready_plan",
        taskId: "task-strip",
        reason: "Ready.",
        proposedChildren: [],
      }),
    ].join("\n");

    expect(stripAifPlanningDecisionBlocks(text)).toBe(
      "## Plan\n- [ ] Keep only runnable checklist content.",
    );
  });

  it("rejects invalid decision values", () => {
    expect(() =>
      parseAifPlanningDecisionContract({
        taskId: "task-invalid",
        text: decisionBlock({
          decision: "plan_ready",
          taskId: "task-invalid",
          reason: "Wrong enum.",
          proposedChildren: [],
        }),
      }),
    ).toThrow(PlanningDecisionContractError);
  });

  it("rejects missing planning decision blocks", () => {
    expect(() =>
      parseAifPlanningDecisionContract({
        taskId: "task-missing",
        text: "## Plan\n- [ ] Missing the decision block.",
      }),
    ).toThrow(/missing_aif_planning_decision/);
  });

  it("rejects task id mismatches", () => {
    expect(() =>
      parseAifPlanningDecisionContract({
        taskId: "task-expected",
        text: decisionBlock({
          decision: "ready_plan",
          taskId: "task-actual",
          reason: "Wrong task.",
          proposedChildren: [],
        }),
      }),
    ).toThrow(/taskId mismatch/);
  });

  it("rejects missing proposedChildren fields", () => {
    expect(() =>
      parseAifPlanningDecisionContract({
        taskId: "task-no-children-field",
        text: decisionBlock({
          decision: "ready_plan",
          taskId: "task-no-children-field",
          reason: "Missing the required children array.",
        }),
      }),
    ).toThrow(/proposedChildren must be an array/);
  });

  it("rejects split_required without valid proposed children", () => {
    expect(() =>
      parseAifPlanningDecisionContract({
        taskId: "task-empty-split",
        text: decisionBlock({
          decision: "split_required",
          taskId: "task-empty-split",
          reason: "Too broad.",
          proposedChildren: [],
        }),
      }),
    ).toThrow(/split_required requires at least one proposed child/);
  });

  it("rejects split child wildcard scope", () => {
    expect(() =>
      parseAifPlanningDecisionContract({
        taskId: "task-wildcard",
        text: decisionBlock({
          decision: "split_required",
          taskId: "task-wildcard",
          reason: "Too broad.",
          proposedChildren: [
            {
              title: "Split wildcard scope",
              taskIntent: "feature",
              scope: ["src/**"],
              acceptanceCriteria: ["Concrete acceptance."],
              verificationCommands: ["npm.cmd run build"],
              forbiddenChanges: ["Do not edit docs."],
            },
          ],
        }),
      }),
    ).toThrow(/concrete file paths/);
  });
});
