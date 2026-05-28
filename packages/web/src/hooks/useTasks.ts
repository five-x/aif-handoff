import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Task,
  WorkflowTimeline,
  CreateTaskInput,
  UpdateTaskInput,
  TaskEvent,
  TaskEventInput,
  TaskComment,
  CreateTaskCommentInput,
  TaskRequirementQuestionsResponse,
  TaskRequirementQuestionBatchAnswerInput,
} from "@aif/shared/browser";
import { api } from "../lib/api.js";

export function useTasks(projectId: string | null) {
  return useQuery<Task[]>({
    queryKey: ["tasks", projectId],
    queryFn: () => api.listTasks(projectId ?? undefined),
    enabled: !!projectId,
  });
}

export function useTask(id: string | null) {
  return useQuery<Task>({
    queryKey: ["task", id],
    queryFn: () => api.getTask(id!),
    enabled: !!id,
  });
}

export function useTaskTimeline(id: string | null) {
  return useQuery<WorkflowTimeline>({
    queryKey: ["task-timeline", id],
    queryFn: () => api.getTaskTimeline(id!),
    enabled: !!id,
  });
}

export function useTaskEvidence(id: string | null) {
  return useQuery({
    queryKey: ["task-evidence", id],
    queryFn: () => api.getTaskEvidence(id!),
    enabled: !!id,
  });
}

export function useTaskMemoryCandidates(id: string | null) {
  return useQuery({
    queryKey: ["task-memory", id],
    queryFn: () => api.getTaskMemoryCandidates(id!),
    enabled: !!id,
  });
}

export function useTaskRuntimeUsage(id: string | null) {
  return useQuery({
    queryKey: ["task-runtime-usage", id],
    queryFn: () => api.getTaskRuntimeUsage(id!),
    enabled: !!id,
  });
}

export function useTaskQuestions(id: string | null, enabled = true) {
  return useQuery<TaskRequirementQuestionsResponse>({
    queryKey: ["task-questions", id],
    queryFn: () => api.getTaskQuestions(id!),
    enabled: !!id && enabled,
  });
}

export function useAnswerTaskQuestionBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      batchId,
      input,
    }: {
      id: string;
      batchId: string;
      input: TaskRequirementQuestionBatchAnswerInput;
    }) => api.answerTaskQuestionBatch(id, batchId, input),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["task-questions", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", variables.id] });
      if (result.task) {
        queryClient.setQueryData(["task", variables.id], result.task);
      }
    },
  });
}

export function useTaskWorktree(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ["task-worktree", id],
    queryFn: () => api.getTaskWorktree(id!),
    enabled: !!id && enabled,
  });
}

export function useProjectKnowledge(projectId: string | null) {
  return useQuery({
    queryKey: ["project-knowledge", projectId],
    queryFn: () => api.getProjectKnowledge(projectId!),
    enabled: !!projectId,
  });
}

export function useProjectRuntimeUsage(projectId: string | null) {
  return useQuery({
    queryKey: ["project-runtime-usage", projectId],
    queryFn: () => api.getProjectRuntimeUsage(projectId!),
    enabled: !!projectId,
  });
}

export function useProjectQueue(projectId: string | null) {
  return useQuery({
    queryKey: ["project-queue", projectId],
    queryFn: () => api.getProjectQueue(projectId!),
    enabled: !!projectId,
  });
}

export function useTaskComments(id: string | null) {
  return useQuery<TaskComment[]>({
    queryKey: ["task-comments", id],
    queryFn: () => api.listTaskComments(id!),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => api.createTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      api.updateTask(id, input),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: ["task", id] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useTaskEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      event,
      deletePlanFile,
      commitOnApprove,
    }: {
      id: string;
      event: TaskEvent;
      deletePlanFile?: TaskEventInput["deletePlanFile"];
      commitOnApprove?: TaskEventInput["commitOnApprove"];
    }) => api.taskEvent(id, event, { deletePlanFile, commitOnApprove }),
    // Optimistic update
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previous = queryClient.getQueryData<Task[]>(["tasks"]);
      const previousTask = queryClient.getQueryData<Task>(["task", id]);

      return { previous, previousTask };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tasks"], context.previous);
      }
      if (context?.previousTask) {
        queryClient.setQueryData(["task", context.previousTask.id], context.previousTask);
      }
    },
    onSuccess: (task) => {
      queryClient.setQueryData(["task", task.id], task);
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", vars.id] });
    },
  });
}

export function useCreateTaskComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateTaskCommentInput }) =>
      api.createTaskComment(id, input),
    onSuccess: (comment) => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", comment.taskId] });
    },
  });
}

export function useReorderTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, position }: { id: string; position: number }) =>
      api.reorderTask(id, position),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useSyncTaskPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.syncTaskPlan(id),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    },
  });
}

export function useCleanupTaskWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "archive" | "delete" }) =>
      api.cleanupTaskWorktree(id, action),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", result.taskId] });
      queryClient.invalidateQueries({ queryKey: ["task-worktree", result.taskId] });
    },
  });
}
