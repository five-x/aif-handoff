import { describe, expect, it } from "vitest";
import { parseChatActions } from "@/lib/chatActions";

describe("parseChatActions", () => {
  it("round-trips explicit taskIntent", () => {
    const parsed = parseChatActions(`Create it.
<!--ACTION:CREATE_TASK-->
{"title":"Audit config","description":"Diagnostic only","taskIntent":"audit","isFix":false}
<!--/ACTION-->`);

    expect(parsed.actions).toEqual([
      {
        type: "create_task",
        title: "Audit config",
        description: "Diagnostic only",
        taskIntent: "audit",
      },
    ]);
  });

  it("keeps legacy isFix actions compatible", () => {
    const parsed = parseChatActions(`Create it.
<!--ACTION:CREATE_TASK-->
{"title":"Fix crash","description":"Bug report","isFix":true}
<!--/ACTION-->`);

    expect(parsed.actions[0]).toMatchObject({
      type: "create_task",
      taskIntent: "fix",
      isFix: true,
    });
  });

  it("keeps omitted taskIntent as general despite typed-looking text", () => {
    const parsed = parseChatActions(`Create it.
<!--ACTION:CREATE_TASK-->
{"title":"Fix audit logging feature","description":"Add security review coverage","isFix":false}
<!--/ACTION-->`);

    expect(parsed.actions[0]).toMatchObject({
      type: "create_task",
      taskIntent: "general",
    });
    expect(parsed.actions[0]).not.toHaveProperty("isFix");
  });

  it("parses follow-up and non-mutating workflow actions", () => {
    const parsed = parseChatActions(`Actions.
<!--ACTION:CREATE_FOLLOW_UP-->
{"title":"Follow up","description":"Use current task context","taskIntent":"feature","sourceRef":"chat:task:t1:session:s1"}
<!--/ACTION-->
<!--ACTION:START_EXPLORE-->
{"prompt":"Explore options","sourceRef":"chat:session:s1"}
<!--/ACTION-->
<!--ACTION:EXPLAIN_BLOCKER-->
{"title":"Blocked","summary":"Waiting on operator input"}
<!--/ACTION-->
<!--ACTION:PREPARE_REPLAN-->
{"title":"Replan","proposal":"Do A then B","rationale":"Scope changed"}
<!--/ACTION-->`);

    expect(parsed.actions).toEqual([
      {
        type: "create_follow_up",
        title: "Follow up",
        description: "Use current task context",
        taskIntent: "feature",
        sourceRef: "chat:task:t1:session:s1",
      },
      { type: "start_explore", prompt: "Explore options", sourceRef: "chat:session:s1" },
      { type: "explain_blocker", title: "Blocked", summary: "Waiting on operator input" },
      {
        type: "prepare_replan",
        title: "Replan",
        proposal: "Do A then B",
        rationale: "Scope changed",
      },
    ]);
  });

  it("drops prohibited or unknown mutating action blocks", () => {
    const parsed = parseChatActions(`No bypass.
<!--ACTION:APPROVE_DONE-->
{"taskId":"t1"}
<!--/ACTION-->
<!--ACTION:VERIFY_MEMORY-->
{"memoryId":"m1"}
<!--/ACTION-->`);

    expect(parsed.actions).toEqual([]);
    expect(parsed.text).toBe("No bypass.");
  });
});
