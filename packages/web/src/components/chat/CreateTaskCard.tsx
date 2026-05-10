import { useState } from "react";
import { Plus, CheckCircle2, ClipboardList } from "lucide-react";
import { useCreateTask } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";
import type { ChatActionCreateTask } from "@aif/shared/browser";

interface CreateTaskCardProps {
  action: ChatActionCreateTask;
  projectId: string;
  onCreated: () => void;
  onOpenTask?: (taskId: string) => void;
}

export function CreateTaskCard({ action, projectId, onCreated, onOpenTask }: CreateTaskCardProps) {
  const createTask = useCreateTask();
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);

  const handleCreate = () => {
    createTask.mutate(
      {
        projectId,
        title: action.title,
        description: action.description,
        taskIntent: action.taskIntent,
        ...(action.isFix ? { isFix: true } : {}),
      },
      {
        onSuccess: (task) => {
          setCreatedTaskId(task.id);
          onCreated();
        },
      },
    );
  };

  return (
    <div className="mx-3 my-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 mb-2">
        <ClipboardList className="h-3.5 w-3.5" />
        {action.isFix ? "Bug Fix" : "New Task"}
      </div>
      <p className="text-sm font-medium text-foreground">{action.title}</p>
      {action.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{action.description}</p>
      )}
      <div className="mt-2 flex items-center gap-2">
        {createdTaskId ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Created
            </span>
            {onOpenTask && (
              <Button
                size="xs"
                onClick={() => onOpenTask(createdTaskId)}
                className="bg-violet-600 text-white hover:bg-violet-700"
              >
                Open Task
              </Button>
            )}
          </>
        ) : (
          <Button
            size="xs"
            onClick={handleCreate}
            disabled={createTask.isPending}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-3 w-3" />
            {createTask.isPending ? "Creating..." : "Create Task"}
          </Button>
        )}
      </div>
    </div>
  );
}
