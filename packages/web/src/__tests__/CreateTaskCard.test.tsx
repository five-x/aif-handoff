import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mutateCreateTask = vi.fn();

vi.mock("@/hooks/useTasks", () => ({
  useCreateTask: () => ({
    mutate: mutateCreateTask,
    isPending: false,
  }),
}));

const { CreateTaskCard } = await import("@/components/chat/CreateTaskCard");

describe("CreateTaskCard", () => {
  it("passes taskIntent through to task creation", () => {
    mutateCreateTask.mockClear();
    render(
      <CreateTaskCard
        projectId="p-1"
        sourceRefFallback="chat:session:s-1"
        onCreated={vi.fn()}
        action={{
          type: "create_task",
          title: "Add checkout",
          description: "Build checkout",
          taskIntent: "feature",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Create Task/ }));

    expect(mutateCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p-1",
        title: "Add checkout",
        description: "Build checkout",
        taskIntent: "feature",
        sourceRef: "chat:session:s-1",
      }),
      expect.any(Object),
    );
  });

  it("uses fallback sourceRef for confirmed follow-up tasks", () => {
    mutateCreateTask.mockClear();
    render(
      <CreateTaskCard
        projectId="p-1"
        sourceRefFallback="chat:task:t-1:session:s-1"
        onCreated={vi.fn()}
        action={{
          type: "create_follow_up",
          title: "Add follow-up",
          description: "Follow-up work",
          taskIntent: "general",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Create Task/ }));

    expect(mutateCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p-1",
        title: "Add follow-up",
        sourceRef: "chat:task:t-1:session:s-1",
      }),
      expect.any(Object),
    );
  });
});
