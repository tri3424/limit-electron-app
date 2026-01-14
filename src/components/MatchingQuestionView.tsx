import type { Question } from '@/lib/db';

interface MatchingQuestionViewProps {
  question: Question;
}

/**
 * View-only component for displaying matching questions in modals/dialogs
 */
export function MatchingQuestionView({ question }: MatchingQuestionViewProps) {
  const pairs = question.matching?.pairs || [];

  if (pairs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {question.matching?.headingHtml && (
        <div 
          className="rounded-md border p-3 bg-muted/40 text-sm" 
          dangerouslySetInnerHTML={{ __html: question.matching.headingHtml }} 
        />
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left side - Prompts */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Match with:</h3>
          {pairs.map((pair) => (
            <div
              key={pair.leftId}
              className="rounded-md border bg-background border-border p-4 min-h-[60px] flex items-center"
            >
              <div className="text-base font-medium">{pair.leftText}</div>
            </div>
          ))}
        </div>

        {/* Right side - Matches */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Matches:</h3>
          {pairs.map((pair) => (
            <div
              key={pair.rightId}
              className="rounded-md border bg-background border-border p-4 min-h-[60px] flex items-center"
            >
              <div className="text-base font-medium">{pair.rightText}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-muted-foreground pt-2 border-t">
        <strong>Correct matches:</strong>
        <div className="mt-2 space-y-1">
          {pairs.map((pair, idx) => (
            <div key={pair.leftId} className="flex items-center gap-2">
              <span className="font-medium">{pair.leftText}</span>
              <span>→</span>
              <span>{pair.rightText}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

