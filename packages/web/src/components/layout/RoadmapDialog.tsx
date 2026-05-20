import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import {
  TASK_INTENT_CONTRACTS,
  TASK_INTENTS,
  formatTaskIntentPrimaryConstraints,
  type Project,
  type TaskIntent,
} from "@aif/shared/browser";
import type { RoadmapImportResult } from "./Header";

interface RoadmapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onImportComplete?: (result: RoadmapImportResult) => void;
}

export function RoadmapDialog({
  open,
  onOpenChange,
  project,
  onImportComplete,
}: RoadmapDialogProps) {
  const [alias, setAlias] = useState("");
  const [taskIntent, setTaskIntent] = useState<TaskIntent>("general");
  const [vision, setVision] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RoadmapImportResult | null>(null);
  const [exists, setExists] = useState<boolean | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const requestInFlightRef = useRef(false);
  const selectedIntentContract = TASK_INTENT_CONTRACTS[taskIntent];
  const selectedIntentConstraints = formatTaskIntentPrimaryConstraints(taskIntent);

  const prevOpenRef = useRef(false);

  const resetAndCheck = useCallback((projectId: string) => {
    setAlias("");
    setTaskIntent("general");
    setVision("");
    setError(null);
    setResult(null);
    setExists(null);
    setImportLoading(false);
    requestInFlightRef.current = false;
    api.checkRoadmapStatus(projectId).then(
      ({ exists: e }) => setExists(e),
      () => setExists(false),
    );
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next && project) {
        resetAndCheck(project.id);
      }
      onOpenChange(next);
    },
    [project, onOpenChange, resetAndCheck],
  );

  // Detect when the parent sets `open` directly (bypassing handleOpenChange).
  // Only fetches roadmap status — no synchronous setState calls.
  useEffect(() => {
    if (open && !prevOpenRef.current && project) {
      api.checkRoadmapStatus(project.id).then(
        ({ exists: e }) => setExists(e),
        () => setExists(false),
      );
    }
    prevOpenRef.current = open;
  }, [open, project]);

  // Listen for roadmap WS events
  useEffect(() => {
    const handleComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (project && detail.projectId === project.id) {
        setResult(detail);
        setLoading(false);
        requestInFlightRef.current = false;
        onImportComplete?.(detail);
      }
    };
    const handleError = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (project && detail.projectId === project.id) {
        setError(detail.error);
        setLoading(false);
        requestInFlightRef.current = false;
      }
    };

    window.addEventListener("roadmap:complete", handleComplete);
    window.addEventListener("roadmap:error", handleError);
    return () => {
      window.removeEventListener("roadmap:complete", handleComplete);
      window.removeEventListener("roadmap:error", handleError);
    };
  }, [project, onImportComplete]);

  const handleGenerate = useCallback(async () => {
    if (!project || !alias.trim() || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      await api.generateRoadmap(project.id, alias.trim(), vision.trim() || undefined, taskIntent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
      requestInFlightRef.current = false;
    }
  }, [project, alias, taskIntent, vision]);

  const handleImport = useCallback(async () => {
    if (!project || !alias.trim() || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setImportLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.importRoadmap(project.id, alias.trim(), taskIntent);
      setResult(res);
      setImportLoading(false);
      requestInFlightRef.current = false;
      onImportComplete?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setImportLoading(false);
      requestInFlightRef.current = false;
    }
  }, [project, alias, taskIntent, onImportComplete]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogClose onClose={() => handleOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>Generate Roadmap Tasks</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-3">
            <div className="border border-green-500/30 bg-green-500/10 px-3 py-2">
              <p className="text-sm font-medium text-green-400">Roadmap generated</p>
              <p className="text-xs text-muted-foreground mt-1">
                Created {result.created} task{result.created !== 1 ? "s" : ""}
                {result.skipped > 0 &&
                  `, skipped ${result.skipped} duplicate${result.skipped !== 1 ? "s" : ""}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Alias: <span className="font-mono text-foreground">{result.roadmapAlias}</span>
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Generate a project roadmap from DESCRIPTION.md, then create backlog tasks
              automatically.
            </p>
            <div>
              <label htmlFor="roadmap-alias" className="block text-xs font-medium mb-1">
                Roadmap alias
              </label>
              <Input
                id="roadmap-alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g. v1.0, sprint-1, mvp"
                disabled={loading || importLoading}
              />
            </div>
            <div>
              <label htmlFor="roadmap-task-intent" className="block text-xs font-medium mb-1">
                Task intent
              </label>
              <Select
                value={taskIntent}
                onChange={(e) => setTaskIntent(e.target.value as TaskIntent)}
                disabled={loading || importLoading}
                options={TASK_INTENTS.map((intent) => ({
                  value: intent,
                  label: TASK_INTENT_CONTRACTS[intent].label,
                }))}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {selectedIntentContract.decomposition}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Primary constraints: {selectedIntentConstraints}
              </p>
            </div>
            <div>
              <label htmlFor="roadmap-vision" className="block text-xs font-medium mb-1">
                Vision / requirements{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                id="roadmap-vision"
                value={vision}
                onChange={(e) => setVision(e.target.value)}
                placeholder="Describe what you want to build, priorities, or constraints..."
                rows={3}
                className="resize-none"
                disabled={loading || importLoading}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className={`grid gap-2 ${exists ? "grid-cols-2" : "grid-cols-1"}`}>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => void handleGenerate()}
                disabled={loading || importLoading || !alias.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Roadmap"
                )}
              </Button>
              {exists && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => void handleImport()}
                  disabled={loading || importLoading || !alias.trim()}
                >
                  {importLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    "Import Existing"
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
