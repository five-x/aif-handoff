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
      }),
      expect.any(Object),
    );
  });
});
