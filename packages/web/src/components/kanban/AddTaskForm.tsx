import { useState, useEffect, useRef, useCallback } from "react";
import { Cpu, Plus, X, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTask } from "@/hooks/useTasks";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useProjects } from "@/hooks/useProjects";
import { useSettings, useProjectDefaults } from "@/hooks/useSettings";
import { useRuntimeProfiles, useRuntimes } from "@/hooks/useRuntimeProfiles";
import { formatRuntimeProfileOptionLabel } from "@/lib/runtimeProfiles";
import {
  TASK_INTENT_CONTRACTS,
  TASK_INTENTS,
  formatTaskIntentPrimaryConstraints,
  generatePlanPath,
  defaultsForMode,
  resolveTaskIntentDefaults,
  type TaskIntent,
} from "@aif/shared/browser";
import { PlannerSettings } from "./PlannerSettings";

interface Props {
  projectId: string;
}

const DEFAULT_PLAN_PATH = ".ai-factory/PLAN.md";

export function AddTaskForm({ projectId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [autoMode, setAutoMode] = useState(true);
  const [taskIntent, setTaskIntent] = useState<TaskIntent>("general");
  const [isFix, setIsFix] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [plannerMode, setPlannerMode] = useState<"full" | "fast">("fast");
  const [planPath, setPlanPath] = useState(DEFAULT_PLAN_PATH);
  const initialFlagDefaults = defaultsForMode("fast");
  const [planDocs, setPlanDocs] = useState(initialFlagDefaults.planDocs);
  const [planTests, setPlanTests] = useState(initialFlagDefaults.planTests);
  const [skipReview, setSkipReview] = useState(initialFlagDefaults.skipReview);
  const [useSubagents, setUseSubagents] = useState(false);
  const [maxReviewIterations, setMaxReviewIterations] = useState(100);
  const [runtimeProfileId, setRuntimeProfileId] = useState("");
  const [modelOverride, setModelOverride] = useState("");
  const [runtimeOverrideOpen, setRuntimeOverrideOpen] = useState(false);
  const [priority, setPriority] = useState(0);
  const createTask = useCreateTask();

  // Track whether the user has manually edited the plan path field.
  // When true, the auto-set effect will not overwrite their edit.
  const userOverride = useRef(false);

  const { data: settings } = useSettings();
  const { data: defaults } = useProjectDefaults(projectId);
  const { data: projectsList } = useProjects();
  const { data: runtimeProfiles = [] } = useRuntimeProfiles(projectId, true);
  const { data: runtimes = [] } = useRuntimes();
  const currentProject = projectsList?.find((p) => p.id === projectId);
  const isParallel = currentProject?.parallelEnabled ?? false;
  const projectTaskRuntimeDefaultId = currentProject?.defaultTaskRuntimeProfileId ?? "";
  const appTaskRuntimeDefaultId =
    settings?.runtimeDefaults?.app?.resolvedDefaultTaskRuntimeProfileId ?? "";
  const runtimeDefaultDescription = projectTaskRuntimeDefaultId
    ? "the project default runtime profile"
    : appTaskRuntimeDefaultId
      ? "the app default runtime profile"
      : "the environment fallback runtime";
  const selectableRuntimeProfiles = runtimeProfiles.filter((profile) => profile.enabled !== false);
  const selectedRuntimeProfile =
    runtimeProfiles.find((profile) => profile.id === runtimeProfileId) ?? null;
  const selectedRuntimeDescriptor = selectedRuntimeProfile
    ? runtimes.find((runtime) => runtime.id === selectedRuntimeProfile.runtimeId)
    : null;

  // Derive defaults from server data (no setState in effects)
  const useSubagentsDefault = settings?.useSubagents ?? false;
  const maxReviewIterationsDefault = settings?.maxReviewIterations ?? 100;
  const defaultPlanPath = defaults?.paths?.plan ?? DEFAULT_PLAN_PATH;
  const plansDir = defaults?.paths?.plans ?? ".ai-factory/plans/";

  const syncServerDefaultsIntoForm = useCallback(() => {
    const intentDefaults = resolveTaskIntentDefaults("general", {
      envUseSubagents: useSubagentsDefault,
    });
    setUseSubagents(useSubagentsDefault);
    setMaxReviewIterations(maxReviewIterationsDefault);
    setPlanPath(defaultPlanPath);
    setRuntimeProfileId("");
    setModelOverride("");
    setPriority(0);
    setTaskIntent("general");
    setIsFix(false);
    // Apply mode-driven flag defaults; isParallel forces full mode defaults.
    const seededMode = isParallel ? "full" : intentDefaults.plannerMode;
    const flags = defaultsForMode(seededMode);
    setPlannerMode(seededMode);
    setSkipReview(flags.skipReview);
    setPlanDocs(flags.planDocs);
    setPlanTests(flags.planTests);
  }, [defaultPlanPath, isParallel, maxReviewIterationsDefault, useSubagentsDefault]);

  const resetAndCloseForm = useCallback(() => {
    setIsOpen(false);
    setTitle("");
    setDescription("");
    setAutoMode(true);
    setTaskIntent("general");
    setIsFix(false);
    setShowAdvanced(false);
    setPlannerMode("fast");
    setPlanPath(defaultPlanPath);
    const resetFlags = defaultsForMode("fast");
    setPlanDocs(resetFlags.planDocs);
    setPlanTests(resetFlags.planTests);
    setSkipReview(resetFlags.skipReview);
    setUseSubagents(useSubagentsDefault);
    setMaxReviewIterations(maxReviewIterationsDefault);
    setRuntimeProfileId("");
    setModelOverride("");
    setPriority(0);
    userOverride.current = false;
  }, [defaultPlanPath, maxReviewIterationsDefault, useSubagentsDefault]);

  const openForm = useCallback(() => {
    syncServerDefaultsIntoForm();
    setIsOpen(true);
  }, [syncServerDefaultsIntoForm]);

  // Listen for global task:create event (Ctrl+N)
  useEffect(() => {
    window.addEventListener("task:create", openForm);
    return () => window.removeEventListener("task:create", openForm);
  }, [openForm]);

  // Close form on Escape key
  const closeForm = useCallback(() => setIsOpen(false), []);
  useKeyboardShortcut({ key: "Escape", enabled: isOpen }, closeForm);

  // Auto-update planPath when title or mode changes (unless user manually edited the field).
  // Called from onChange handlers rather than useEffect to avoid cascading renders.
  const syncPlanPath = (nextTitle: string, nextMode: "full" | "fast") => {
    if (userOverride.current) return;
    const path = generatePlanPath(nextTitle.trim(), nextMode, {
      plansDir,
      defaultPlanPath,
    });
    setPlanPath(path);
    if (nextTitle.trim()) {
      console.debug("[kanban] Auto-set plan path:", path);
    }
  };

  const applyIntentDefaults = (nextIntent: TaskIntent, nextTitle = title) => {
    const intentDefaults = resolveTaskIntentDefaults(nextIntent, {
      envUseSubagents: useSubagentsDefault,
    });
    const nextMode = isParallel ? "full" : intentDefaults.plannerMode;
    setTaskIntent(nextIntent);
    setIsFix(intentDefaults.isFix);
    setPlannerMode(nextMode);
    setSkipReview(nextIntent === "audit" ? false : intentDefaults.skipReview);
    setPlanDocs(intentDefaults.planDocs);
    setPlanTests(intentDefaults.planTests);
    setUseSubagents(
      nextIntent === "audit" || nextIntent === "spike" ? true : intentDefaults.useSubagents,
    );
    syncPlanPath(nextTitle, nextMode);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    syncPlanPath(value, plannerMode);
  };

  const handleModeChange = (mode: "full" | "fast") => {
    setPlannerMode(mode);
    syncPlanPath(title, mode);
    const flags = defaultsForMode(mode);
    setSkipReview(flags.skipReview);
    setPlanDocs(flags.planDocs);
    setPlanTests(flags.planTests);
  };

  // Effective values: parallel projects force full mode
  const effectiveIntent = isFix ? "fix" : taskIntent;
  const effectiveMode = effectiveIntent === "audit" || isParallel ? "full" : plannerMode;
  const effectivePlanPath = isParallel
    ? generatePlanPath(title.trim(), "full", { plansDir, defaultPlanPath })
    : planPath.trim() || defaultPlanPath;
  const effectiveSkipReview = effectiveIntent === "audit" ? false : skipReview;
  const effectiveUseSubagents =
    effectiveIntent === "audit" || effectiveIntent === "spike" ? true : useSubagents;
  const selectedIntentContract = TASK_INTENT_CONTRACTS[taskIntent];
  const selectedIntentConstraints = formatTaskIntentPrimaryConstraints(taskIntent);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    console.debug("[kanban] Creating task:", title);
    createTask.mutate(
      {
        projectId,
        title: title.trim(),
        description: description.trim(),
        autoMode,
        taskIntent: effectiveIntent,
        isFix: effectiveIntent === "fix",
        plannerMode: effectiveMode,
        planPath: effectivePlanPath,
        planDocs,
        planTests,
        skipReview: effectiveSkipReview,
        useSubagents: effectiveUseSubagents,
        maxReviewIterations,
        runtimeProfileId: runtimeProfileId || null,
        modelOverride: modelOverride.trim() || null,
        priority,
      },
      {
        onSuccess: () => {
          resetAndCloseForm();
        },
        onError: (error) => {
          console.error("[kanban] Failed to create task", error);
        },
      },
    );
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-center gap-1 border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
        onClick={openForm}
        type="button"
      >
        <Plus className="h-4 w-4" />
        Add task
        <span className="ml-auto font-mono text-3xs text-muted-foreground">Ctrl+N</span>
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border border-border bg-background/65 p-2.5">
      <Input
        placeholder="Task title"
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        autoFocus
      />
      <Textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <div className="space-y-2 border border-border/60 bg-muted/20 p-2">
        <div className="space-y-1">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Task type
          </p>
          <Select
            selectSize="sm"
            value={taskIntent}
            onChange={(e) => applyIntentDefaults(e.target.value as TaskIntent)}
            options={TASK_INTENTS.map((intent) => ({
              value: intent,
              label: TASK_INTENT_CONTRACTS[intent].label,
            }))}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground">
            {selectedIntentContract.decomposition}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Primary constraints: {selectedIntentConstraints}
          </p>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox
            aria-label="Auto mode"
            checked={autoMode}
            onChange={(e) => setAutoMode(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5"
          />
          <span>
            <span className="font-medium text-foreground">Auto mode</span>
            {
              " - AI moves tasks between statuses automatically; the user only starts the process and verifies the result."
            }
          </span>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">Priority</span>
          <Select
            selectSize="sm"
            value={String(priority)}
            onChange={(e) => setPriority(Number(e.target.value))}
            options={[
              { value: "0", label: "None" },
              { value: "1", label: "Low" },
              { value: "2", label: "Medium" },
              { value: "3", label: "High" },
              { value: "4", label: "Urgent" },
              { value: "5", label: "Critical" },
            ]}
            className="w-32"
          />
        </div>
      </div>
      {!isFix && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced((v) => !v)}
            className="gap-1.5 text-muted-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Planner settings
          </Button>
          {showAdvanced && (
            <PlannerSettings
              isParallel={isParallel}
              plannerMode={plannerMode}
              onModeChange={handleModeChange}
              planPath={planPath}
              onPlanPathChange={(v) => {
                userOverride.current = true;
                setPlanPath(v);
              }}
              effectivePlanPath={effectivePlanPath}
              defaultPlanPath={defaultPlanPath}
              planDocs={planDocs}
              onPlanDocsChange={setPlanDocs}
              planTests={planTests}
              onPlanTestsChange={setPlanTests}
            />
          )}
        </div>
      )}
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={skipReview}
            onChange={(e) => setSkipReview(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5"
          />
          <span>
            <span className="font-medium text-foreground">Skip review</span>
            {" - After implementation, move directly to done without code review."}
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={useSubagents}
            onChange={(e) => setUseSubagents(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5"
          />
          <span>
            <span className="font-medium text-foreground">Use subagents</span>
            {
              " - Run via custom subagents (plan-coordinator, implement-coordinator, sidecars). Disable to use aif-* skills directly."
            }
          </span>
        </label>
      </div>
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRuntimeOverrideOpen((v) => !v)}
          className="gap-1.5 text-muted-foreground"
        >
          <Cpu className="h-3.5 w-3.5" />
          Runtime override
        </Button>
        {runtimeOverrideOpen && (
          <div className="space-y-2 border border-border/60 bg-muted/20 p-2">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Runtime profile
              </p>
              <select
                className="h-7 w-full rounded border border-input bg-background px-2 text-xs"
                value={runtimeProfileId}
                onChange={(e) => setRuntimeProfileId(e.target.value)}
              >
                <option value="">
                  {projectTaskRuntimeDefaultId
                    ? "(project default)"
                    : "(none — runtime resolved by system defaults)"}
                </option>
                {selectableRuntimeProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {formatRuntimeProfileOptionLabel(profile)}
                  </option>
                ))}
              </select>
              {!runtimeProfileId && (
                <p className="text-[10px] text-muted-foreground">
                  No override uses {runtimeDefaultDescription}.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Model override
              </p>
              <Input
                value={modelOverride}
                onChange={(e) => setModelOverride(e.target.value)}
                placeholder="runtime default"
                className="h-7 text-xs"
              />
            </div>
            {selectedRuntimeDescriptor &&
              !selectedRuntimeDescriptor.capabilities.supportsAgentDefinitions && (
                <p className="text-[10px] text-muted-foreground">
                  This runtime does not support subagents — skills mode will be used instead.
                </p>
              )}
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={!title.trim() || createTask.isPending}>
          {createTask.isPending ? "Adding..." : "Add"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={resetAndCloseForm}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
