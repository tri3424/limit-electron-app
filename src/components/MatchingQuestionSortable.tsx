import { useState, useEffect, useRef } from 'react';
import type { Question } from '@/lib/db';
import { GripVertical } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MatchingQuestionSortableProps {
  question: Question;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
	revealCorrectness?: boolean;
}

/**
 * Matching question component with draggable side-by-side items
 * User drags right items to reorder them to match with left prompts
 */
export function MatchingQuestionSortable({
  question,
  value,
  onChange,
  disabled = false,
	revealCorrectness = true,
}: MatchingQuestionSortableProps) {
  const pairs = question.matching?.pairs || [];
  const [orderedRightIds, setOrderedRightIds] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);

  // Initialize/refresh order whenever we move to a different question
  // or the number of pairs changes.
  useEffect(() => {
    if (pairs.length === 0) {
      setOrderedRightIds([]);
      return;
    }

    // If the parent has a valid value for this question (e.g. on review or resume),
    // respect that ordering instead of reshuffling.
    if (value && value.length === pairs.length) {
      setOrderedRightIds(value);
      return;
    }

    // Otherwise, create a fresh shuffled order for this question that does not
    // start with any right item in its correct position (a simple derangement).
    const rightIds = pairs.map((p) => p.rightId);
    let shuffled = [...rightIds];

    if (rightIds.length > 1) {
      // Start with a random permutation
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      // Fix any positions that accidentally match their correct pair
      for (let i = 0; i < shuffled.length; i++) {
        if (shuffled[i] === rightIds[i]) {
          // Find a position to swap with that doesn't create another fixed point
          const swapIndex =
            shuffled.findIndex(
              (id, j) => j !== i && id !== rightIds[i] && shuffled[i] !== rightIds[j],
            ) ?? -1;

          const j = swapIndex >= 0 ? swapIndex : (i + 1) % shuffled.length;
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
      }
    }

    setOrderedRightIds(shuffled);

    // Initialize parent value if it's empty or mismatched.
    if (!value || value.length !== pairs.length) {
      onChange(shuffled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, pairs.length]);

  // Keep local order in sync if the parent explicitly updates value later
  // (e.g. when loading saved attempts).
  useEffect(() => {
    if (value && value.length === pairs.length) {
      setOrderedRightIds(value);
    }
  }, [value, pairs.length]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (disabled) return;
    dragItemRef.current = index;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', '');
    // Make the dragged element semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (disabled) return;
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragItemRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (disabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    if (disabled || dragItemRef.current === null) return;
    e.preventDefault();
    
    const dragIndex = dragItemRef.current;
    if (dragIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      dragItemRef.current = null;
      return;
    }

    const newOrder = [...orderedRightIds];
    const [draggedItem] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, draggedItem);
    
    setOrderedRightIds(newOrder);
    onChange(newOrder);
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragItemRef.current = null;
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const getRightItemById = (rightId: string) => {
    return pairs.find(p => p.rightId === rightId);
  };

  // Find the correct position for each right item
  const getCorrectPosition = (rightId: string) => {
    return pairs.findIndex(p => p.rightId === rightId) + 1;
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {question.matching?.headingHtml && (
          <div 
            className="rounded-md border p-3 bg-muted/40 text-sm" 
            dangerouslySetInnerHTML={{ __html: question.matching.headingHtml }} 
          />
        )}
        
        <div className="space-y-4">
          {pairs.map((pair, idx) => {
            const rightId = orderedRightIds[idx] || '';
            const rightItem = rightId ? getRightItemById(rightId) : null;
            const isCorrect = rightId === pair.rightId;
            const isDragging = draggedIndex === idx;
            const isDragOver = dragOverIndex === idx;
						const correctPosition = rightItem ? getCorrectPosition(rightItem.rightId) : null;
						const showResult = disabled && revealCorrectness;
            
            return (
              <div
                key={pair.leftId}
                className={`grid grid-cols-2 gap-4 items-center transition-all duration-200 ${
                  isDragOver ? 'scale-[1.02]' : ''
                }`}
              >
                {/* Left prompt */}
                <div className={`rounded-md border p-4 h-[80px] flex items-center gap-3 transition-all duration-200 ${
                  showResult
                    ? isCorrect
                      ? 'bg-green-50 border-green-300'
                      : 'bg-red-50 border-red-300'
                    : disabled
							? 'bg-muted/20 border-muted-foreground/30'
							: 'bg-background border-border'
                }`}>
						{disabled && (
							<span className={`text-lg font-bold min-w-[24px] text-center ${
								showResult
									? (isCorrect ? 'text-green-600' : 'text-red-600')
									: 'text-muted-foreground'
							}`}>
								{idx + 1}
							</span>
						)}
                  <div className="text-base font-medium flex-1">{pair.leftText}</div>
                </div>

                {/* Right item (draggable) */}
                <div className="h-[80px] flex items-center">
                  <div
                    draggable={!disabled}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragLeave={handleDragLeave}
                    className={`flex-1 rounded-md border p-4 flex items-center justify-between transition-all duration-300 cursor-move ${
                      showResult
                        ? isCorrect
								? 'bg-green-50 border-green-300 cursor-default'
								: 'bg-red-50 border-red-300 cursor-default'
							: disabled
								? 'bg-muted/20 border-muted-foreground/30 cursor-default'
                        : isDragging
                        ? 'opacity-50 scale-95 shadow-lg border-primary'
                        : isDragOver
                        ? 'border-primary bg-primary/10 scale-[1.02]'
                        : 'bg-background border-border hover:border-primary/50 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {!disabled && (
                        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="text-base font-medium flex-1">
                        {rightItem ? rightItem.rightText : '—'}
                      </div>
                    </div>
						{showResult && (
                      <div className="flex items-center gap-2">
                        {!isCorrect && correctPosition && (
                          <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded">
                            #{correctPosition}
                          </span>
                        )}
                        {isCorrect && (
                          <span className="text-xs text-green-600 font-bold">✓</span>
                        )}
                        {!isCorrect && (
                          <span className="text-xs text-red-600 font-bold">✗</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
