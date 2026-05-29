import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import type {
  TaskRequirementQuestion,
  TaskRequirementQuestionsResponse,
} from "@aif/shared/browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { useAnswerTaskQuestionBatch } from "@/hooks/useTasks";

function AnswerInput({
  question,
  value,
  onChange,
}: {
  question: TaskRequirementQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  if (question.answerType === "boolean") {
    return (
      <select
        className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select...</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  }

  if (question.answerType === "single_choice" && question.options?.length) {
    return (
      <select
        className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select...</option>
        {question.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (question.answerType === "textarea" || question.answerType === "multi_choice") {
    return (
      <textarea
        className="mt-2 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value}
        placeholder={question.placeholder ?? undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      type={
        question.answerType === "number"
          ? "number"
          : question.answerType === "date"
            ? "date"
            : "text"
      }
      value={value}
      placeholder={question.placeholder ?? undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function QuestionsPanel({
  taskId,
  questions,
  isLoading,
}: {
  taskId: string;
  questions?: TaskRequirementQuestionsResponse | null;
  isLoading?: boolean;
}) {
  const answerBatch = useAnswerTaskQuestionBatch();
  const openBatch = useMemo(
    () => questions?.batches.find((batch) => batch.status === "open"),
    [questions],
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [autoResume, setAutoResume] = useState(true);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" />
        <span>Loading questions...</span>
      </div>
    );
  }

  if (!openBatch) {
    return <div className="text-sm text-muted-foreground">No open clarification questions.</div>;
  }

  const openQuestions = openBatch.questions.filter((question) => question.status === "open");
  const answeredCount = openBatch.questions.length - openQuestions.length;
  const canSubmit = openQuestions
    .filter((question) => question.blocking)
    .every((question) => answers[question.id]?.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Answers are needed before agents can continue.</span>
        <Badge variant="outline" size="sm">
          {openBatch.stage}
        </Badge>
        <Badge variant="outline" size="sm">
          resume {openBatch.targetResumeStage}
        </Badge>
        <Badge variant="outline" size="sm">
          blocking {openBatch.openBlockingCount}
        </Badge>
      </div>

      <div className="space-y-3">
        {openQuestions.map((question) => (
          <div key={question.id} className="rounded-md border border-border bg-background p-3">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1 text-sm font-medium">{question.question}</div>
              <Badge variant={question.blocking ? "destructive" : "outline"} size="sm">
                {question.blocking ? "blocking" : "optional"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{question.whyNeeded}</p>
            <AnswerInput
              question={question}
              value={answers[question.id] ?? ""}
              onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={autoResume}
            onChange={(event) => setAutoResume(event.target.checked)}
          />
          Continue automatically after answers
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {answeredCount}/{openBatch.questions.length} answered
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit || answerBatch.isPending}
            onClick={() =>
              answerBatch.mutate({
                id: taskId,
                batchId: openBatch.batchId,
                input: {
                  autoResume,
                  answers: openQuestions
                    .filter((question) => answers[question.id]?.trim())
                    .map((question) => ({
                      questionId: question.id,
                      answer: answers[question.id].trim(),
                      attachments: [],
                    })),
                },
              })
            }
          >
            {answerBatch.isPending ? "Submitting..." : "Submit answers"}
          </Button>
        </div>
      </div>
    </div>
  );
}
