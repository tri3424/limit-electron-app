import { useState } from 'react';
import type { DayQuestionDetail } from '@/lib/statsHelpers';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

interface MatchingQuestionAttemptViewProps {
  detail: DayQuestionDetail;
}

/**
 * Component to display matching question attempt with user answers and option to show correct answers
 */
export function MatchingQuestionAttemptView({ detail }: MatchingQuestionAttemptViewProps) {
  const [showCorrect, setShowCorrect] = useState(true);
  const pairs = detail.questionMatching?.pairs || [];
  const userOrderedIds = Array.isArray(detail.userAnswerIds) ? detail.userAnswerIds : [];
  const correctOrderedIds = Array.isArray(detail.correctAnswerIds) ? detail.correctAnswerIds : [];

  if (pairs.length === 0) {
    return null;
  }

  const getRightItemById = (rightId: string) => {
    return pairs.find(p => p.rightId === rightId);
  };

  const getCorrectPosition = (rightId: string) => {
    return pairs.findIndex(p => p.rightId === rightId) + 1;
  };

  return (
    <div className="space-y-4">
      {detail.questionMatching?.headingHtml && (
        <div 
          className="rounded-md border p-3 bg-muted/40 text-sm" 
          dangerouslySetInnerHTML={{ __html: detail.questionMatching.headingHtml }} 
        />
      )}
      
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">
          {showCorrect ? 'Correct Matching' : 'Your Matching'}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCorrect(!showCorrect)}
        >
          {showCorrect ? (
            <>
              <EyeOff className="h-4 w-4 mr-2" />
              Show Your Answer
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Show Correct Answers
            </>
          )}
        </Button>
      </div>

      <div className="space-y-4">
        {pairs.map((pair, idx) => {
          const userRightId = userOrderedIds[idx] || '';
          const userRightItem = userRightId ? getRightItemById(userRightId) : null;
          const isCorrect = userRightId === pair.rightId;
          const correctPosition = userRightItem ? getCorrectPosition(userRightItem.rightId) : null;
          const displayRightId = showCorrect ? pair.rightId : userRightId;
          const displayRightItem = displayRightId ? getRightItemById(displayRightId) : null;
          const isDisplayCorrect = displayRightId === pair.rightId;

          return (
            <div
              key={pair.leftId}
              className="grid grid-cols-2 gap-4 items-center"
            >
              {/* Left prompt */}
              <div className={`rounded-md border p-4 h-[80px] flex items-center gap-3 transition-all duration-200 ${
                showCorrect
                  ? isDisplayCorrect
                    ? 'bg-green-50 border-green-300'
                    : 'bg-red-50 border-red-300'
                  : isCorrect
                  ? 'bg-green-50 border-green-300'
                  : 'bg-red-50 border-red-300'
              }`}>
                <span className={`text-lg font-bold min-w-[24px] text-center ${
                  showCorrect
                    ? isDisplayCorrect ? 'text-green-600' : 'text-red-600'
                    : isCorrect ? 'text-green-600' : 'text-red-600'
                }`}>
                  {idx + 1}
                </span>
                <div className="text-base font-medium flex-1">{pair.leftText}</div>
              </div>

              {/* Right item */}
              <div className="h-[80px] flex items-center">
                <div className={`flex-1 rounded-md border p-4 flex items-center justify-between transition-all duration-300 ${
                  showCorrect
                    ? isDisplayCorrect
                      ? 'bg-green-50 border-green-300'
                      : 'bg-red-50 border-red-300'
                    : isCorrect
                    ? 'bg-green-50 border-green-300'
                    : 'bg-red-50 border-red-300'
                }`}>
                  <div className="text-base font-medium flex-1">
                    {displayRightItem ? displayRightItem.rightText : '—'}
                  </div>
                  <div className="flex items-center gap-2">
                    {!showCorrect && !isCorrect && correctPosition && (
                      <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded">
                        #{correctPosition}
                      </span>
                    )}
                    {showCorrect ? (
                      isDisplayCorrect ? (
                        <span className="text-xs text-green-600 font-bold">✓</span>
                      ) : (
                        <span className="text-xs text-red-600 font-bold">✗</span>
                      )
                    ) : (
                      isCorrect ? (
                        <span className="text-xs text-green-600 font-bold">✓</span>
                      ) : (
                        <span className="text-xs text-red-600 font-bold">✗</span>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

