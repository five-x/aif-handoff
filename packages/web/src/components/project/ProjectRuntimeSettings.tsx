import { useMemo, useState } from "react";
import type { Project, RuntimeProfile } from "@aif/shared/browser";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { useUpdateProject } from "@/hooks/useProjects";
import {
  useAppRuntimeDefaults,
  useCreateRuntimeProfile,
  useDeleteRuntimeProfile,
  useProjectConfigAudit,
  useProjectConfigGovernance,
  useProjectRuntimeProfiles,
  useRuntimes,
  useRuntimeProfiles,
  useUpdateRuntimeProfile,
  useValidateRuntimeProfile,
} from "@/hooks/useRuntimeProfiles";
import { RuntimeProfileForm } from "@/components/settings/RuntimeProfileForm";
import { formatRuntimeProfileOptionLabel } from "@/lib/runtimeProfiles";
import { getRuntimeLimitDisplay, runtimeLimitBadgeClassName } from "@/lib/runtimeLimits";
import { useUsageLimitsEnabled } from "@/hooks/useSettings";

interface Props {
  project: Project;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function ProjectRuntimeSettings({
  project,
  open,
  onOpenChange,
  hideTrigger = false,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpenState = (next: boolean) => {
    onOpenChange?.(next);
    if (open === undefined) {
      setInternalOpen(next);
    }
  };
  const [taskDefaultId, setTaskDefaultId] = useState(
    () => project.defaultTaskRuntimeProfileId ?? "",
  );
  const [planDefaultId, setPlanDefaultId] = useState(
    () => project.defaultPlanRuntimeProfileId ?? "",
  );
  const [reviewDefaultId, setReviewDefaultId] = useState(
    () => project.defaultReviewRuntimeProfileId ?? "",
  );
  const [chatDefaultId, setChatDefaultId] = useState(
    () => project.defaultChatRuntimeProfileId ?? "",
  );
  const [editingProfile, setEditingProfile] = useState<RuntimeProfile | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<RuntimeProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusVariant, setStatusVariant] = useState<"success" | "error" | "neutral">("neutral");

  const updateProject = useUpdateProject();
  const createProfile = useCreateRuntimeProfile();
  const updateProfile = useUpdateRuntimeProfile();
  const deleteProfile = useDeleteRuntimeProfile();
  const validateProfile = useValidateRuntimeProfile();
  const { data: runtimes = [] } = useRuntimes();
  const { data: appRuntimeDefaults } = useAppRuntimeDefaults(isOpen);
  const { data: profiles = [], isLoading } = useRuntimeProfiles(project.id, true, isOpen);
  const { data: projectProfiles = [], isLoading: projectProfilesLoading } =
    useProjectRuntimeProfiles(project.id, isOpen);
  const { data: configGovernance } = useProjectConfigGovernance(project.id, isOpen);
  const { data: configAudit = [] } = useProjectConfigAudit(project.id, isOpen);
  const globalProfiles = useMemo(
    () => profiles.filter((profile) => profile.projectId == null),
    [profiles],
  );

  const runtimeOptions = useMemo(() => {
    return profiles
      .filter((profile) => profile.enabled !== false)
      .map((profile) => ({
        id: profile.id,
        label: formatRuntimeProfileOptionLabel(profile),
      }));
  }, [profiles]);
  const usageLimitsEnabled = useUsageLimitsEnabled();
  const recentLimitSignals = useMemo(() => {
    if (!usageLimitsEnabled) return [];
    return profiles.flatMap((profile) => {
      const limitDisplay = getRuntimeLimitDisplay(profile.runtimeLimitSnapshot, {
        checkedAt: profile.runtimeLimitUpdatedAt ?? null,
      });
      return limitDisplay ? [{ profile, limitDisplay }] : [];
    });
  }, [profiles, usageLimitsEnabled]);

  const taskDefaultEmptyLabel = appRuntimeDefaults?.resolvedDefaultTaskRuntimeProfileId
    ? "(app default)"
    : "(env fallback)";
  const planDefaultEmptyLabel =
    taskDefaultId ||
    appRuntimeDefaults?.resolvedDefaultPlanRuntimeProfileId ||
    appRuntimeDefaults?.resolvedDefaultTaskRuntimeProfileId
      ? taskDefaultId
        ? "(inherit from project task default)"
        : "(app default)"
      : "(env fallback)";
  const reviewDefaultEmptyLabel =
    taskDefaultId ||
    appRuntimeDefaults?.resolvedDefaultReviewRuntimeProfileId ||
    appRuntimeDefaults?.resolvedDefaultTaskRuntimeProfileId
      ? taskDefaultId
        ? "(inherit from project task default)"
        : "(app default)"
      : "(env fallback)";
  const chatDefaultEmptyLabel = appRuntimeDefaults?.resolvedDefaultChatRuntimeProfileId
    ? "(app default)"
    : "(env fallback)";
  const deletingProfileIsGlobal = deletingProfile?.projectId == null;
  const blockingIssues = configGovernance?.issues.filter((issue) => issue.blocksWork) ?? [];
  const warningIssues =
    configGovernance?.issues.filter((issue) => issue.severity !== "error" && !issue.blocksWork) ??
    [];
  const recentConfigEvents = configGovernance?.recentAuditEvents?.length
    ? configGovernance.recentAuditEvents
    : configAudit;
  const governanceTone = blockingIssues.length > 0 ? "blocked" : (configGovernance?.status ?? "ok");
  const defaultPermissionMode =
    configGovernance?.permissionPolicy.defaultByIntent?.general ?? "workspace_write";

  const handleSaveDefaults = async () => {
    setStatusMessage(null);
    try {
      await updateProject.mutateAsync({
        id: project.id,
        input: {
          name: project.name,
          rootPath: project.rootPath,
          plannerMaxBudgetUsd: project.plannerMaxBudgetUsd ?? undefined,
          planCheckerMaxBudgetUsd: project.planCheckerMaxBudgetUsd ?? undefined,
          implementerMaxBudgetUsd: project.implementerMaxBudgetUsd ?? undefined,
          reviewSidecarMaxBudgetUsd: project.reviewSidecarMaxBudgetUsd ?? undefined,
          parallelEnabled: project.parallelEnabled,
          defaultTaskRuntimeProfileId: taskDefaultId || null,
          defaultPlanRuntimeProfileId: planDefaultId || null,
          defaultReviewRuntimeProfileId: reviewDefaultId || null,
          defaultChatRuntimeProfileId: chatDefaultId || null,
        },
      });
      setStatusMessage("Project runtime defaults saved.");
      setStatusVariant("success");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save defaults");
      setStatusVariant("error");
    }
  };

  const handleValidateProfile = async (profileId: string) => {
    setStatusMessage(null);
    setStatusVariant("neutral");
    try {
      const result = await validateProfile.mutateAsync({ profileId, forceRefresh: true });
      const expectedEnvVar =
        result.details && typeof result.details.expectedEnvVar === "string"
          ? result.details.expectedEnvVar
          : null;
      if (result.ok) {
        setStatusMessage(`Validation OK: ${result.message}`);
        setStatusVariant("success");
        return;
      }
      const envHint = expectedEnvVar ? ` (expected env var: ${expectedEnvVar})` : "";
      setStatusMessage(`Validation failed: ${result.message}${envHint}`);
      setStatusVariant("error");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Validation failed");
      setStatusVariant("error");
    }
  };

  const handleCreateProfile = async (input: {
    projectId?: string | null;
    name: string;
    runtimeId: string;
    providerId: string;
    transport?: string | null;
    baseUrl?: string | null;
    apiKeyEnvVar?: string | null;
    defaultModel?: string | null;
    headers?: Record<string, string>;
    options?: Record<string, unknown>;
    enabled?: boolean;
  }) => {
    await createProfile.mutateAsync({ ...input, projectId: project.id });
    setCreating(false);
  };

  const handleUpdateProfile = async (input: {
    projectId?: string | null;
    name: string;
    runtimeId: string;
    providerId: string;
    transport?: string | null;
    baseUrl?: string | null;
    apiKeyEnvVar?: string | null;
    defaultModel?: string | null;
    headers?: Record<string, string>;
    options?: Record<string, unknown>;
    enabled?: boolean;
  }) => {
    if (!editingProfile) return;
    await updateProfile.mutateAsync({
      id: editingProfile.id,
      input: { ...input, projectId: project.id },
    });
    setEditingProfile(null);
  };

  const handleMakeProfileGlobal = async (profile: RuntimeProfile) => {
    setStatusMessage(null);
    setStatusVariant("neutral");
    try {
      await updateProfile.mutateAsync({
        id: profile.id,
        input: { projectId: null },
      });
      if (editingProfile?.id === profile.id) {
        setEditingProfile(null);
      }
      setStatusMessage(`"${profile.name}" is now available to all projects.`);
      setStatusVariant("success");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to make profile global");
      setStatusVariant("error");
    }
  };

  const handleCopyGlobalProfile = async (profile: RuntimeProfile) => {
    setStatusMessage(null);
    setStatusVariant("neutral");
    try {
      await createProfile.mutateAsync({
        projectId: project.id,
        name: profile.name,
        runtimeId: profile.runtimeId,
        providerId: profile.providerId,
        transport: profile.transport ?? null,
        baseUrl: profile.baseUrl ?? null,
        apiKeyEnvVar: profile.apiKeyEnvVar ?? null,
        defaultModel: profile.defaultModel ?? null,
        headers: profile.headers ?? {},
        options: profile.options ?? {},
        enabled: profile.enabled,
      });
      setStatusMessage(`Copied "${profile.name}" into this project.`);
      setStatusVariant("success");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to copy global profile into project",
      );
      setStatusVariant("error");
    }
  };

  if (!isOpen) {
    if (hideTrigger) return null;
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpenState(true)}>
        Runtime Profiles
      </Button>
    );
  }

  return (
    <div className="mb-4 space-y-3 border border-border bg-card/50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Runtime Profiles</h3>
        <Button size="sm" variant="ghost" onClick={() => setOpenState(false)}>
          Close
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Implementation (default)</p>
          <Select
            value={taskDefaultId}
            onChange={(e) => setTaskDefaultId(e.target.value)}
            placeholder={taskDefaultEmptyLabel}
            options={[
              { value: "", label: taskDefaultEmptyLabel },
              ...runtimeOptions.map((o) => ({ value: o.id, label: o.label })),
            ]}
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Planning</p>
          <Select
            value={planDefaultId}
            onChange={(e) => setPlanDefaultId(e.target.value)}
            placeholder={planDefaultEmptyLabel}
            options={[
              { value: "", label: planDefaultEmptyLabel },
              ...runtimeOptions.map((o) => ({ value: o.id, label: o.label })),
            ]}
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Review</p>
          <Select
            value={reviewDefaultId}
            onChange={(e) => setReviewDefaultId(e.target.value)}
            placeholder={reviewDefaultEmptyLabel}
            options={[
              { value: "", label: reviewDefaultEmptyLabel },
              ...runtimeOptions.map((o) => ({ value: o.id, label: o.label })),
            ]}
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Chat</p>
          <Select
            value={chatDefaultId}
            onChange={(e) => setChatDefaultId(e.target.value)}
            placeholder={chatDefaultEmptyLabel}
            options={[
              { value: "", label: chatDefaultEmptyLabel },
              ...runtimeOptions.map((o) => ({ value: o.id, label: o.label })),
            ]}
          />
        </div>
      </div>

      <div>
        <Button size="sm" onClick={handleSaveDefaults} disabled={updateProject.isPending}>
          {updateProject.isPending ? "Saving..." : "Save Project Defaults"}
        </Button>
      </div>

      {configGovernance && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {governanceTone === "blocked" ? (
                <ShieldX className="h-4 w-4 text-destructive" />
              ) : governanceTone === "warning" ? (
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-green-500" />
              )}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Config Governance
              </p>
            </div>
            <Badge
              size="sm"
              variant={governanceTone === "blocked" ? "error" : "secondary"}
              className={
                governanceTone === "warning"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                  : undefined
              }
            >
              {governanceTone.toUpperCase()}
            </Badge>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <GovernanceMetric
              label="Runtime defaults"
              value={[
                configGovernance.projectRuntimeDefaults.defaultTaskRuntimeProfileId
                  ? "project"
                  : configGovernance.appRuntimeDefaults.resolvedDefaultTaskRuntimeProfileId
                    ? "app"
                    : "env",
                configGovernance.projectRuntimeDefaults.defaultChatRuntimeProfileId
                  ? "chat project"
                  : configGovernance.appRuntimeDefaults.resolvedDefaultChatRuntimeProfileId
                    ? "chat app"
                    : "chat env",
              ].join(" / ")}
            />
            <GovernanceMetric
              label="Policy"
              value={[
                defaultPermissionMode,
                configGovernance.env.features.bypassPermissions ? "bypass on" : "bypass off",
                configGovernance.env.features.taskWorktreesEnabled ? "worktrees on" : "shared tree",
              ].join(" / ")}
            />
            <GovernanceMetric
              label="Memory / Usage"
              value={[
                configGovernance.env.features.memoryEnabled ? "memory on" : "memory off",
                configGovernance.env.features.usageLimitsEnabled ? "limits on" : "limits off",
              ].join(" / ")}
            />
            <GovernanceMetric
              label="MCP"
              value={`${configGovernance.mcp.serverCount} server${
                configGovernance.mcp.serverCount === 1 ? "" : "s"
              }`}
            />
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1 border border-border bg-background/40 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Project Config
              </p>
              <p className="text-xs">
                git={String(configGovernance.projectConfig.git?.enabled ?? true)} branch=
                {String(configGovernance.projectConfig.git?.base_branch ?? "main")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                verify={String(configGovernance.projectConfig.workflow?.verify_mode ?? "normal")}{" "}
                plan={String(configGovernance.projectConfig.paths?.plan ?? ".ai-factory/PLAN.md")}
              </p>
            </div>
            <div className="space-y-1 border border-border bg-background/40 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Runtime Secrets
              </p>
              <p className="text-xs">
                {configGovernance.runtimeProfiles.length} profile
                {configGovernance.runtimeProfiles.length === 1 ? "" : "s"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {configGovernance.runtimeProfiles
                  .slice(0, 3)
                  .map(
                    (profile) =>
                      `${profile.name}:${profile.apiKeyEnvVar ?? "env default"}=${
                        profile.apiKeyConfigured ? "set" : "unset"
                      }`,
                  )
                  .join(" / ") || "no runtime profiles"}
              </p>
            </div>
          </div>

          {(blockingIssues.length > 0 || warningIssues.length > 0) && (
            <div className="space-y-1">
              {[...blockingIssues, ...warningIssues].slice(0, 4).map((issue) => (
                <div
                  key={`${issue.source}-${issue.code}-${issue.path ?? ""}`}
                  className="flex items-start gap-2 border border-border bg-background/40 px-2 py-1.5"
                >
                  <Badge size="xs" variant={issue.severity === "error" ? "error" : "outline"}>
                    {issue.code}
                  </Badge>
                  <p className="min-w-0 text-[11px] text-muted-foreground">{issue.message}</p>
                </div>
              ))}
            </div>
          )}

          {recentConfigEvents.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recent Config Events
              </p>
              {recentConfigEvents.slice(0, 3).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-2 border border-border bg-background/40 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs">{event.action}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {event.reasonCodes.join(", ") || event.sourceKind}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatConfigEventTime(event.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {usageLimitsEnabled && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent Limit Signals
          </p>
          {recentLimitSignals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent runtime limit signals.</p>
          ) : (
            <div className="space-y-1">
              {recentLimitSignals.map(({ profile, limitDisplay }) => (
                <div
                  key={`limit-${profile.id}`}
                  className="border border-border bg-background/40 px-2 py-1.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium">{profile.name}</span>
                    <Badge size="sm" className={runtimeLimitBadgeClassName(limitDisplay.tone)}>
                      {limitDisplay.label.toUpperCase()}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {profile.runtimeId}/{profile.providerId}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{limitDisplay.summary}</p>
                  {(limitDisplay.resetText || limitDisplay.checkedText) && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {[limitDisplay.resetText, limitDisplay.checkedText].filter(Boolean).join(" ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Project Profiles
        </p>
        <p className="text-[11px] text-muted-foreground">
          Project profiles are local to this project. Use Make Global to reuse one everywhere.
        </p>

        {creating ? (
          <RuntimeProfileForm
            mode="create"
            projectId={project.id}
            runtimes={runtimes}
            onSubmit={handleCreateProfile}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <Button className="w-full" size="sm" variant="outline" onClick={() => setCreating(true)}>
            + New Project Profile
          </Button>
        )}

        {editingProfile && (
          <RuntimeProfileForm
            key={editingProfile.id}
            mode="edit"
            projectId={editingProfile.projectId}
            runtimes={runtimes}
            initial={editingProfile}
            onSubmit={handleUpdateProfile}
            onCancel={() => setEditingProfile(null)}
          />
        )}

        {isLoading || projectProfilesLoading ? (
          <p className="text-xs text-muted-foreground">Loading project runtime profiles...</p>
        ) : projectProfiles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No project-specific runtime profiles configured.
          </p>
        ) : (
          <div className="space-y-1">
            {projectProfiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-start justify-between rounded border border-border bg-background/40 px-2 py-1.5"
              >
                <div className="min-w-0 pr-3">
                  <p className="text-xs font-medium">{formatRuntimeProfileOptionLabel(profile)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    transport={profile.transport ?? "default"} model=
                    {profile.defaultModel ?? "auto"} {profile.enabled ? "" : "disabled"}
                  </p>
                  {usageLimitsEnabled &&
                    (() => {
                      const limitDisplay = getRuntimeLimitDisplay(profile.runtimeLimitSnapshot, {
                        checkedAt: profile.runtimeLimitUpdatedAt ?? null,
                      });
                      if (!limitDisplay) {
                        return (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            No recent runtime limit signal.
                          </p>
                        );
                      }
                      return (
                        <div className="mt-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              size="sm"
                              className={runtimeLimitBadgeClassName(limitDisplay.tone)}
                            >
                              {limitDisplay.label.toUpperCase()}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {limitDisplay.summary}
                            </span>
                          </div>
                          {(limitDisplay.resetText || limitDisplay.checkedText) && (
                            <p className="text-[11px] text-muted-foreground">
                              {[limitDisplay.resetText, limitDisplay.checkedText]
                                .filter(Boolean)
                                .join(" ")}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleValidateProfile(profile.id)}
                    disabled={validateProfile.isPending}
                  >
                    Validate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleMakeProfileGlobal(profile)}
                    disabled={updateProfile.isPending}
                  >
                    Make Global
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingProfile(profile)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeletingProfile(profile)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Global Profiles
        </p>
        <p className="text-[11px] text-muted-foreground">
          Available to this project by default. Copy one to create a project-local fork.
        </p>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading global runtime profiles...</p>
        ) : globalProfiles.length === 0 ? (
          <p className="text-xs text-muted-foreground">No global runtime profiles available.</p>
        ) : (
          <div className="space-y-1">
            {globalProfiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between rounded border border-border bg-background/40 px-2 py-1.5"
              >
                <div>
                  <p className="text-xs font-medium">{formatRuntimeProfileOptionLabel(profile)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    transport={profile.transport ?? "default"} model=
                    {profile.defaultModel ?? "auto"} {profile.enabled ? "" : "disabled"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleValidateProfile(profile.id)}
                    disabled={validateProfile.isPending}
                  >
                    Validate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleCopyGlobalProfile(profile)}
                    disabled={createProfile.isPending}
                  >
                    Copy to Project
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeletingProfile(profile)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {statusMessage && (
          <p
            className={`mt-2 text-xs ${
              statusVariant === "error"
                ? "text-red-500"
                : statusVariant === "success"
                  ? "text-green-500"
                  : "text-muted-foreground"
            }`}
          >
            {statusMessage}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={deletingProfile !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingProfile(null);
        }}
        title={deletingProfileIsGlobal ? "Delete Global Runtime Profile" : "Delete Runtime Profile"}
        description={
          deletingProfileIsGlobal
            ? `Delete "${deletingProfile?.name}" globally? Projects using this profile will fall back to project, app, or environment defaults.`
            : `Delete "${deletingProfile?.name}"? Tasks and projects using this profile will fall back to defaults.`
        }
        confirmLabel="Delete"
        variant="destructive"
        disabled={deleteProfile.isPending}
        onConfirm={() => {
          if (!deletingProfile) return;
          void deleteProfile.mutateAsync(deletingProfile.id).then(() => setDeletingProfile(null));
        }}
      />
    </div>
  );
}

function GovernanceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-background/40 p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-xs">{value}</p>
    </div>
  );
}

function formatConfigEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
