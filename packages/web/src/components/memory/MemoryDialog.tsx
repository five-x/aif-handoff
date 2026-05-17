import { useMemo, useState } from "react";
import { Ban, Check, Clock, RefreshCw, Save, X } from "lucide-react";
import type {
  MemoryClaim,
  MemoryClaimSource,
  MemoryItem,
  MemoryItemStatus,
} from "@aif/shared/browser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import {
  useApproveMemoryItem,
  useExpireMemoryItem,
  useMemoryItems,
  useRejectMemoryItem,
  useUpdateMemoryItem,
} from "@/hooks/useMemory";
import { cn } from "@/lib/utils";

interface MemoryDialogProps {
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_ITEMS = [
  { value: "pending", label: "PENDING" },
  { value: "approved", label: "APPROVED" },
  { value: "rejected", label: "REJECTED" },
  { value: "expired", label: "EXPIRED" },
];

function statusVariant(status: MemoryItemStatus) {
  if (status === "approved") return "default";
  if (status === "pending") return "secondary";
  if (status === "rejected") return "destructive";
  return "outline";
}

function formatDate(value: string | null): string {
  if (!value) return "No expiry";
  return new Date(value).toLocaleString();
}

function claimSourceHasReference(source: MemoryClaimSource): boolean {
  if (source.kind === "task") return Boolean(source.taskId || source.ref);
  if (source.kind === "artifact") return Boolean(source.artifactId || source.path || source.ref);
  if (source.kind === "evidence") return Boolean(source.evidenceId || source.ref);
  if (source.kind === "code") return Boolean(source.path || source.ref);
  if (source.kind === "memory") return Boolean(source.memoryId || source.ref);
  if (source.kind === "document") return Boolean(source.path || source.ref);
  if (source.kind === "commit") return Boolean(source.ref);
  if (source.kind === "url") return Boolean(source.ref && /^https?:\/\//i.test(source.ref));
  return false;
}

function claimIsSourceBacked(claim: MemoryClaim): boolean {
  return claim.text.trim().length > 0 && claim.sources.some(claimSourceHasReference);
}

function hasOnlySourceBackedClaims(item: MemoryItem): boolean {
  return item.claims.length > 0 && item.claims.every(claimIsSourceBacked);
}

interface ClaimSourceLink {
  label: string;
  href: string;
  external?: boolean;
}

function taskHref(projectId: string | null, taskId: string): string {
  return projectId
    ? `/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`
    : `#task:${encodeURIComponent(taskId)}`;
}

function sourceRefHref(projectId: string | null, ref: string): { href: string; external: boolean } {
  const taskRef = ref.match(/^task:(.+)$/);
  if (taskRef?.[1]) return { href: taskHref(projectId, taskRef[1]), external: false };
  if (/^https?:\/\//i.test(ref)) return { href: ref, external: true };
  return { href: `#ref:${encodeURIComponent(ref)}`, external: false };
}

function MemorySourceAnchor({
  children,
  href,
  external,
}: {
  children: string;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="font-mono text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}

function buildClaimSourceLinks(
  source: MemoryClaimSource,
  projectId: string | null,
): ClaimSourceLink[] {
  const links: ClaimSourceLink[] = [];
  const addLocal = (label: string, prefix: string, value: string) => {
    links.push({ label, href: `#${prefix}:${encodeURIComponent(value)}` });
  };

  if (source.taskId) {
    links.push({ label: `task:${source.taskId}`, href: taskHref(projectId, source.taskId) });
  }
  if (source.artifactId) addLocal(`artifact:${source.artifactId}`, "artifact", source.artifactId);
  if (source.evidenceId) addLocal(`evidence:${source.evidenceId}`, "evidence", source.evidenceId);
  if (source.memoryId) addLocal(`memory:${source.memoryId}`, "memory", source.memoryId);
  if (source.path) addLocal(`path:${source.path}`, "path", source.path);
  if (source.ref) {
    const refLink = sourceRefHref(projectId, source.ref);
    if (!source.taskId && source.ref.match(/^task:(.+)$/)) {
      links.push({ label: `ref:${source.ref}`, ...refLink });
    } else if (refLink.external) {
      links.push({ label: `ref:${source.ref}`, ...refLink });
    } else {
      addLocal(`ref:${source.ref}`, "ref", source.ref);
    }
  }

  return links;
}

function MemoryClaimSourceLinks({
  source,
  projectId,
}: {
  source: MemoryClaimSource;
  projectId: string | null;
}) {
  const links = buildClaimSourceLinks(source, projectId);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span>{source.kind}</span>
      {links.map((link) => (
        <MemorySourceAnchor
          key={`${link.label}:${link.href}`}
          href={link.href}
          external={link.external}
        >
          {link.label}
        </MemorySourceAnchor>
      ))}
    </div>
  );
}

function MemoryClaimList({
  claims,
  projectId,
}: {
  claims: MemoryClaim[];
  projectId: string | null;
}) {
  if (claims.length === 0) {
    return <div className="text-sm text-destructive">No source-backed claims.</div>;
  }

  return (
    <div className="grid gap-2">
      {claims.map((claim) => (
        <div key={claim.claimId} className="border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="xs" variant="outline">
              {claim.type}
            </Badge>
            <Badge size="xs" variant={claim.status === "approved" ? "default" : "secondary"}>
              {claim.status}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">{claim.claimId}</span>
          </div>
          <div className="mt-2 text-sm text-foreground">{claim.text}</div>
          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
            {claim.sources.map((source, index) => (
              <MemoryClaimSourceLinks
                key={`${claim.claimId}:${index}`}
                source={source}
                projectId={projectId}
              />
            ))}
            {claim.supersedes.length > 0 && <div>Supersedes: {claim.supersedes.join(", ")}</div>}
            {claim.contradicts.length > 0 && <div>Contradicts: {claim.contradicts.join(", ")}</div>}
            <div>Validated: {claim.lastValidatedAt ?? "pending"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemoryListItem({
  item,
  selected,
  onSelect,
}: {
  item: MemoryItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent/50",
        selected && "bg-primary/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{item.title}</div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary}</div>
        </div>
        <Badge size="xs" variant={statusVariant(item.status)}>
          {item.status}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge size="xs" variant="outline">
          {item.scope}
        </Badge>
        <Badge size="xs" variant="outline">
          {item.itemType}
        </Badge>
        {item.failureFamily && (
          <Badge size="xs" variant="secondary">
            {item.failureFamily}
          </Badge>
        )}
        {item.redactionStatus === "blocked" && (
          <Badge size="xs" variant="destructive">
            blocked
          </Badge>
        )}
      </div>
    </button>
  );
}

function MemoryEditor({ item, projectId }: { item: MemoryItem; projectId: string | null }) {
  const updateMutation = useUpdateMemoryItem(projectId);
  const approveMutation = useApproveMemoryItem(projectId);
  const rejectMutation = useRejectMemoryItem(projectId);
  const expireMutation = useExpireMemoryItem(projectId);
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary);
  const [content, setContent] = useState(item.content);
  const [tags, setTags] = useState(item.tags.join(", "));
  const [reviewNote, setReviewNote] = useState(item.reviewNote ?? "");
  const sourceBacked = hasOnlySourceBackedClaims(item);

  const busy =
    updateMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    expireMutation.isPending;

  const save = () => {
    updateMutation.mutate({
      id: item.id,
      input: {
        title,
        summary,
        content,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        reviewNote: reviewNote.trim() || null,
      },
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
          <Badge variant="outline">{item.scope}</Badge>
          <Badge variant="outline">{item.itemType}</Badge>
          {item.sourceTaskId && <Badge variant="secondary">task</Badge>}
          {item.failureFamily && <Badge variant="secondary">{item.failureFamily}</Badge>}
          {item.redactionStatus === "blocked" && (
            <Badge variant="destructive">redaction blocked</Badge>
          )}
          {!sourceBacked && <Badge variant="destructive">missing source</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">{formatDate(item.expiresAt)}</div>
      </div>

      {item.publishBlockReason && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-3 text-sm text-destructive">
          {item.publishBlockReason}
        </div>
      )}

      {!sourceBacked && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-3 text-sm text-destructive">
          Approval requires every claim to include a task, artifact, evidence, code, document,
          commit, URL, or memory source.
        </div>
      )}

      <div className="grid flex-1 gap-4 overflow-y-auto px-5 py-4">
        <div className="grid gap-2 text-xs text-muted-foreground">
          {item.sourceTaskId && (
            <div>
              <MemorySourceAnchor href={taskHref(projectId, item.sourceTaskId)}>
                {`Source task: ${item.sourceTaskId}`}
              </MemorySourceAnchor>
            </div>
          )}
          {item.sourceRef && (
            <div>
              <MemorySourceAnchor
                href={sourceRefHref(projectId, item.sourceRef).href}
                external={sourceRefHref(projectId, item.sourceRef).external}
              >
                {`Source ref: ${item.sourceRef}`}
              </MemorySourceAnchor>
            </div>
          )}
        </div>

        <label className="grid gap-1 text-xs font-medium uppercase text-muted-foreground">
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-9 border border-input bg-card px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        <label className="grid gap-1 text-xs font-medium uppercase text-muted-foreground">
          Summary
          <Textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="min-h-[90px]"
          />
        </label>

        <label className="grid gap-1 text-xs font-medium uppercase text-muted-foreground">
          Content
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-[190px] font-mono text-xs"
          />
        </label>

        <label className="grid gap-1 text-xs font-medium uppercase text-muted-foreground">
          Tags
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            className="h-9 border border-input bg-card px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        <label className="grid gap-1 text-xs font-medium uppercase text-muted-foreground">
          Review note
          <Textarea
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            className="min-h-[80px]"
          />
        </label>

        <section className="grid gap-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">Claims</div>
          <MemoryClaimList claims={item.claims} projectId={projectId} />
        </section>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="outline" size="sm" onClick={save} disabled={busy}>
          <Save className="mr-1.5 h-4 w-4" />
          Save
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => expireMutation.mutate({ id: item.id, note: reviewNote || null })}
          disabled={busy || item.status === "expired"}
        >
          <Clock className="mr-1.5 h-4 w-4" />
          Expire
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => rejectMutation.mutate({ id: item.id, note: reviewNote || null })}
          disabled={busy || item.status === "rejected"}
        >
          <Ban className="mr-1.5 h-4 w-4" />
          Reject
        </Button>
        <Button
          size="sm"
          onClick={() => approveMutation.mutate({ id: item.id, note: reviewNote || null })}
          disabled={
            busy ||
            item.status === "approved" ||
            item.redactionStatus === "blocked" ||
            !sourceBacked
          }
        >
          {item.redactionStatus === "blocked" || !sourceBacked ? (
            <X className="mr-1.5 h-4 w-4" />
          ) : (
            <Check className="mr-1.5 h-4 w-4" />
          )}
          Approve
        </Button>
      </div>
    </>
  );
}

export function MemoryDialog({ projectId, open, onOpenChange }: MemoryDialogProps) {
  const [status, setStatus] = useState<MemoryItemStatus>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: items = [], isFetching, refetch } = useMemoryItems(projectId, { status });
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0">
        <DialogClose onClose={() => onOpenChange(false)} />
        <DialogHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-4 pr-8">
            <DialogTitle>Memory Review</DialogTitle>
            <div className="flex items-center gap-2">
              <SegmentedControl
                items={STATUS_ITEMS}
                value={status}
                onValueChange={(value) => {
                  setStatus(value as MemoryItemStatus);
                  setSelectedId(null);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void refetch()}
                disabled={isFetching}
                aria-label="Refresh memory"
                title="Refresh memory"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-[620px] grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)]">
          <div className="border-b border-border md:border-b-0 md:border-r">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No {status} memory items.
              </div>
            ) : (
              <div className="max-h-[620px] overflow-y-auto">
                {items.map((item) => (
                  <MemoryListItem
                    key={item.id}
                    item={item}
                    selected={selected?.id === item.id}
                    onSelect={() => setSelectedId(item.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Select a memory item.
              </div>
            ) : (
              <MemoryEditor
                key={`${selected.id}:${selected.updatedAt}`}
                item={selected}
                projectId={projectId}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
