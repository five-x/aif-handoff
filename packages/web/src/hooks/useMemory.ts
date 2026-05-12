import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { MemoryItemStatus, MemoryScope, UpdateMemoryItemInput } from "@aif/shared/browser";
import { api } from "@/lib/api";

export const memoryQueryKey = (projectId: string | null) => ["memory", projectId];

export function invalidateMemoryQueries(queryClient: QueryClient, projectId?: string | null) {
  queryClient.invalidateQueries({ queryKey: ["memory"] });
  if (projectId) queryClient.invalidateQueries({ queryKey: memoryQueryKey(projectId) });
}

export function useMemoryItems(
  projectId: string | null,
  filters: { status?: MemoryItemStatus; scope?: MemoryScope } = {},
) {
  return useQuery({
    queryKey: [...memoryQueryKey(projectId), filters.status ?? "all", filters.scope ?? "all"],
    queryFn: () =>
      api.listMemoryItems({
        projectId: projectId ?? undefined,
        includeGlobal: true,
        status: filters.status,
        scope: filters.scope,
      }),
    enabled: Boolean(projectId),
  });
}

export function useUpdateMemoryItem(projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMemoryItemInput }) =>
      api.updateMemoryItem(id, input),
    onSuccess: (item) => invalidateMemoryQueries(queryClient, item.projectId ?? projectId),
  });
}

export function useApproveMemoryItem(projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) =>
      api.approveMemoryItem(id, note),
    onSuccess: (item) => invalidateMemoryQueries(queryClient, item.projectId ?? projectId),
  });
}

export function useRejectMemoryItem(projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) =>
      api.rejectMemoryItem(id, note),
    onSuccess: (item) => invalidateMemoryQueries(queryClient, item.projectId ?? projectId),
  });
}

export function useExpireMemoryItem(projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) =>
      api.expireMemoryItem(id, note),
    onSuccess: (item) => invalidateMemoryQueries(queryClient, item.projectId ?? projectId),
  });
}
