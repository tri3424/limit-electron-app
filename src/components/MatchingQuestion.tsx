import { useState, useEffect } from 'react';
import type { Question } from '@/lib/db';

interface MatchingQuestionProps {
  question: Question;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

/**
 * Matching question component with draggable rectangles
 * Right items are draggable and can be matched with left prompts
 */
export function MatchingQuestion({
  question,
  value,
  onChange,
  disabled = false,
}: MatchingQuestionProps) {
  const pairs = question.matching?.pairs || [];
  const [assigned, setAssigned] = useState<string[]>(value || []);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);
  const [shuffledRight, setShuffledRight] = useState<typeof pairs>([]);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  // Initialize shuffled right items on mount
  useEffect(() => {
    if (pairs.length > 0) {
      const shuffled = [...pairs].sort(() => Math.random() - 0.5);
      setShuffledRight(shuffled);
    }
  }, [pairs]);

  // Initialize assigned array
  useEffect(() => {
    if (assigned.length < pairs.length) {
      const newAssigned = [...assigned];
      for (let i = assigned.length; i < pairs.length; i++) {
        newAssigned[i] = '';
      }
      setAssigned(newAssigned);
    }
  }, [pairs.length, assigned.length]);

  // Sync with parent value
  useEffect(() => {
    if (value && value.length === pairs.length) {
      setAssigned(value);
    }
  }, [value, pairs.length]);

  const handleDragStart = (e: React.DragEvent, rightId: string) => {
    if (disabled) return;
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItem(rightId);
    
    // Calculate offset for smooth dragging
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    
    // Make the dragged element more visible
    (e.currentTarget as HTMLElement).style.opacity = '0.4';
  };

  const handleDrag = (e: React.DragEvent) => {
    if (!draggedItem) return;
    // Update visual feedback during drag
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    const leftItem = elements.find(el => 
      el.classList.contains('left-match-item') && 
      el.getAttribute('data-index') !== null
    );
    if (leftItem) {
      const index = parseInt(leftItem.getAttribute('data-index') || '-1', 10);
      setDraggedOverIndex(index >= 0 ? index : null);
    } else {
      setDraggedOverIndex(null);
    }
  };

  const handleDragOver = (e: React.DragEvent, leftIndex: number) => {
    if (disabled || !draggedItem) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDraggedOverIndex(leftIndex);
  };

  const handleDragLeave = () => {
    setDraggedOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, leftIndex: number) => {
    if (disabled || !draggedItem) return;
    e.preventDefault();
    
    const newAssigned = [...assigned];
    newAssigned[leftIndex] = draggedItem;
    setAssigned(newAssigned);
    onChange(newAssigned);
    setDraggedItem(null);
    setDraggedOverIndex(null);
    setDragOffset(null);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '';
    setDraggedItem(null);
    setDraggedOverIndex(null);
    setDragOffset(null);
  };

  const handleRemoveMatch = (leftIndex: number) => {
    if (disabled) return;
    const newAssigned = [...assigned];
    newAssigned[leftIndex] = '';
    setAssigned(newAssigned);
    onChange(newAssigned);
  };

  const getRightItemById = (rightId: string) => {
    return pairs.find(p => p.rightId === rightId);
  };

  const isRightItemMatched = (rightId: string) => {
    return assigned.includes(rightId);
  };

  const getMatchedLeftIndex = (rightId: string) => {
    return assigned.findIndex(id => id === rightId);
  };

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .dragging {
          transform: rotate(3deg) scale(1.05) !important;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
          z-index: 1000 !important;
        }
      `}</style>
      <div className="space-y-6">
        {question.matching?.headingHtml && (
          <div 
            className="rounded-md border p-3 bg-muted/40 text-sm" 
            dangerouslySetInnerHTML={{ __html: question.matching.headingHtml }} 
          />
        )}
      
      <div className="space-y-4">
        {/* Left side - Prompts with matched items aligned */}
        {pairs.map((pair, idx) => {
          const matchedRightId = assigned[idx] || '';
          const matchedRight = matchedRightId ? getRightItemById(matchedRightId) : null;
          const isDraggedOver = draggedOverIndex === idx;
          
          return (
              <div
                key={pair.leftId}
                className={`grid grid-cols-2 gap-4 items-center transition-all duration-300 ease-out ${
                  isDraggedOver ? 'scale-[1.02] transform' : ''
                }`}
                style={{
                  animation: matchedRight ? 'slideUp 0.3s ease-out' : undefined,
                }}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, idx)}
              >
              {/* Left prompt */}
              <div
                data-index={idx}
                className={`left-match-item relative rounded-md border p-4 h-[80px] flex items-center transition-all duration-200 ${
                  matchedRightId
                    ? 'bg-green-50 border-green-300'
                    : isDraggedOver
                    ? 'bg-green-50 border-green-500 border-2 border-dashed'
                    : 'bg-background border-border'
                }`}
              >
                <div className="flex-1">
                  <div className="text-base font-medium">{pair.leftText}</div>
                  {matchedRight && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Matched:</span>
                      <span className="text-base font-medium text-green-700">{matchedRight.rightText}</span>
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMatch(idx)}
                          className="text-xs text-red-600 hover:text-red-800 underline ml-2"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right matched item (aligned side-by-side) */}
              <div className="h-[80px] flex items-center transition-all duration-300">
                {matchedRight ? (
                  <div 
                    className="w-full rounded-md border p-4 bg-green-50 border-green-300 flex items-center transition-all duration-300"
                    style={{
                      animation: 'slideInRight 0.3s ease-out',
                    }}
                  >
                    <div className="text-base font-medium text-green-700">{matchedRight.rightText}</div>
                  </div>
                ) : (
                  <div className={`w-full rounded-md border border-dashed p-4 flex items-center justify-center transition-all duration-200 ${
                    isDraggedOver 
                      ? 'border-green-500 bg-green-50 scale-[1.02]' 
                      : 'border-muted-300 bg-muted/20'
                  }`}>
                    <span className="text-xs text-muted-foreground">Drop match here</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right side - Draggable items pool */}
      <div className="space-y-3 pt-4 border-t">
        <h3 className="text-sm font-semibold text-muted-foreground">Available matches (drag to match):</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {shuffledRight.map((pair) => {
            const isMatched = isRightItemMatched(pair.rightId);
            const matchedLeftIndex = getMatchedLeftIndex(pair.rightId);
            const isDragging = draggedItem === pair.rightId;
            
            return (
              <div
                key={pair.rightId}
                draggable={!disabled && !isMatched}
                onDragStart={(e) => handleDragStart(e, pair.rightId)}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                className={`rounded-md border p-3 h-[70px] flex items-center cursor-move select-none transition-all duration-300 ease-in-out ${
                  isMatched
                    ? 'bg-muted opacity-50 cursor-not-allowed'
                    : isDragging
                    ? 'dragging opacity-60 border-primary border-2'
                    : 'bg-background border-border hover:border-primary hover:shadow-lg hover:scale-[1.03] hover:-translate-y-1 active:scale-100 active:translate-y-0'
                } ${disabled ? 'cursor-not-allowed' : ''}`}
                style={{
                  cursor: disabled || isMatched ? 'not-allowed' : 'grab',
                  animation: !isMatched && !isDragging ? 'slideUp 0.3s ease-out' : undefined,
                  animationDelay: `${shuffledRight.indexOf(pair) * 0.05}s`,
                }}
              >
                <div className="text-base font-medium flex-1">{pair.rightText}</div>
                {isMatched && matchedLeftIndex >= 0 && (
                  <div className="text-xs text-muted-foreground ml-2">
                    ✓ Matched
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

        {assigned.some(a => a) && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            {assigned.filter(a => a).length} of {pairs.length} items matched
          </div>
        )}
      </div>
    </>
  );
}
