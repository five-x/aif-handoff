import { getWorkflowPack, type TaskIntent, type WorkflowPack } from "@aif/shared";

export interface RoadmapWorkflowPack<Hooks> {
  readonly workflowPack: WorkflowPack;
  readonly hooks?: Hooks;
}

export interface RoadmapWorkflowPackResolver<Hooks> {
  get(intent: TaskIntent): RoadmapWorkflowPack<Hooks>;
  list(): readonly RoadmapWorkflowPack<Hooks>[];
}

export function createRoadmapWorkflowPackResolver<Hooks>(
  hooksByIntent: Partial<Record<TaskIntent, Hooks>>,
): RoadmapWorkflowPackResolver<Hooks> {
  const hookedIntents = Object.freeze(Object.keys(hooksByIntent) as TaskIntent[]);

  const get = (intent: TaskIntent): RoadmapWorkflowPack<Hooks> =>
    Object.freeze({
      workflowPack: getWorkflowPack(intent),
      hooks: hooksByIntent[intent],
    });

  return Object.freeze({
    get,
    list: () => hookedIntents.map((intent) => get(intent)),
  });
}
