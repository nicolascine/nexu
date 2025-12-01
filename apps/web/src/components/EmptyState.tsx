import suggestedQuestions from "@/config/demo-suggested-questions.json";

interface EmptyStateProps {
  onSelectExample: (example: string) => void;
  repositoryId?: string;
}

function getExamples(repositoryId?: string): string[] {
  if (!repositoryId) return suggestedQuestions.default;
  const questions = suggestedQuestions[repositoryId as keyof typeof suggestedQuestions];
  return questions || suggestedQuestions.default;
}

export function EmptyState({ onSelectExample, repositoryId }: EmptyStateProps) {
  const examples = getExamples(repositoryId);
  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-xl mx-auto text-center space-y-6 sm:space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">
            nexu
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Chat with your codebase
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs sm:text-sm text-muted-foreground">
            Try asking
          </p>
          <div className="grid gap-2">
            {examples.map((example) => (
              <button
                key={example}
                onClick={() => onSelectExample(example)}
                className="px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border border-border bg-background hover:bg-surface active:bg-surface text-xs sm:text-sm text-left text-foreground transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
