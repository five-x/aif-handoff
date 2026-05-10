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
});
