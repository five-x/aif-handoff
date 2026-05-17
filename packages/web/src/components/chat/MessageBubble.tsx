import { memo } from "react";
import { AlertTriangle, Bot, RefreshCw, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";
import { AttachmentChip } from "@/components/ui/attachment-chip";
import { Button } from "@/components/ui/button";
import { parseChatActions } from "@/lib/chatActions";
import { CreateTaskCard } from "./CreateTaskCard";
import type { ChatMessage } from "@aif/shared/browser";

interface MessageBubbleProps {
  message: ChatMessage;
  projectId: string;
  sessionId: string | null;
  taskId?: string | null;
  onTaskCreated: () => void;
  onOpenTask?: (taskId: string) => void;
  onStartExplore?: (prompt?: string) => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  projectId,
  sessionId,
  taskId,
  onTaskCreated,
  onOpenTask,
  onStartExplore,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const parsed = !isUser ? parseChatActions(message.content) : null;
  const displayContent = parsed?.text ?? message.content;
  const actions = parsed?.actions ?? [];
  const sourceRefFallback = taskId
    ? `chat:task:${taskId}:session:${sessionId ?? "new"}`
    : `chat:session:${sessionId ?? "new"}`;

  return (
    <>
      {displayContent.trim() && (
        <div className={cn("flex gap-2.5 px-3 py-2", isUser ? "flex-row-reverse" : "flex-row")}>
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs",
              isUser ? "bg-blue-600 text-white" : "bg-violet-600 text-white",
            )}
          >
            {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
          </div>
          <div
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-sm break-words",
              isUser ? "bg-blue-600/15 text-foreground" : "bg-violet-600/15 text-foreground",
            )}
          >
            <Markdown content={displayContent} className="text-sm" />
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {message.attachments.map((att, idx) =>
                  att.path && sessionId ? (
                    <a
                      key={idx}
                      href={`/chat/sessions/${sessionId}/attachments/${encodeURIComponent(att.name)}`}
                      download={att.name}
                    >
                      <AttachmentChip
                        name={att.name}
                        className="hover:text-foreground cursor-pointer"
                      />
                    </a>
                  ) : (
                    <AttachmentChip key={idx} name={att.name} className="text-muted-foreground" />
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {actions.map((action, i) => {
        if (action.type === "create_task" || action.type === "create_follow_up") {
          return (
            <CreateTaskCard
              key={i}
              action={action}
              projectId={projectId}
              sourceRefFallback={sourceRefFallback}
              onCreated={onTaskCreated}
              onOpenTask={onOpenTask}
            />
          );
        }
        if (action.type === "start_explore") {
          return (
            <div key={i} className="mx-3 my-1.5 rounded border border-sky-500/40 bg-sky-500/10 p-3">
              {action.prompt && (
                <p className="mb-2 text-xs text-muted-foreground">{action.prompt}</p>
              )}
              <Button
                size="xs"
                onClick={() => onStartExplore?.(action.prompt)}
                className="bg-sky-600 text-white hover:bg-sky-700"
              >
                <Search className="h-3 w-3" />
                Start Explore
              </Button>
            </div>
          );
        }
        if (action.type === "explain_blocker") {
          return (
            <div
              key={i}
              className="mx-3 my-1.5 rounded border border-amber-500/40 bg-amber-500/10 p-3"
            >
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                {action.title ?? "Blocker"}
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{action.summary}</p>
            </div>
          );
        }
        if (action.type === "prepare_replan") {
          return (
            <div
              key={i}
              className="mx-3 my-1.5 rounded border border-indigo-500/40 bg-indigo-500/10 p-3"
            >
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-indigo-400">
                <RefreshCw className="h-3.5 w-3.5" />
                {action.title ?? "Replan Proposal"}
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{action.proposal}</p>
              {action.rationale && (
                <p className="mt-2 text-2xs text-muted-foreground whitespace-pre-wrap">
                  {action.rationale}
                </p>
              )}
            </div>
          );
        }
        return null;
      })}
    </>
  );
});
