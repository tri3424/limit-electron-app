import type { DayQuestionDetail } from '@/lib/statsHelpers';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FillBlanksAttemptViewProps {
  detail: DayQuestionDetail;
}

/**
 * Component to display fill-blanks question attempt with user answers and tooltips showing correct answers
 */
export function FillBlanksAttemptView({ detail }: FillBlanksAttemptViewProps) {
  const blanks = detail.questionFillBlanks?.blanks || [];
  const userAnswers = detail.questionFillBlanks?.userAnswers || [];
  const questionText = detail.questionText;

  if (blanks.length === 0 || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold">Your Answers</div>
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: questionText }} />
      </div>
    );
  }

  // Check if answer is correct for a blank
  const isBlankCorrect = (idx: number) => {
    const blank = blanks[idx];
    if (!blank) return null;
    const userAnswer = (userAnswers[idx] || '').trim().toLowerCase();
    const correctAnswer = blank.correct.trim().toLowerCase();
    return userAnswer === correctAnswer;
  };

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${questionText}</div>`, 'text/html');
  const container = doc.body.firstElementChild;

  const renderNode = (node: ChildNode, key: string): any => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    const el = node as HTMLElement;
    const isBlank = el.getAttribute('data-blank') === 'true';
    
    if (isBlank) {
      const blankId = el.getAttribute('data-blank-id') || '';
      const blankIndex = blanks.findIndex((b) => b.id === blankId);
      const idx = blankIndex >= 0 ? blankIndex : 0;
      const correct = isBlankCorrect(idx);
      const blank = blanks[idx];
      const userAnswer = userAnswers[idx] || '';
      // Show tooltip for incorrect or unattempted blanks
      const showTooltip = (correct === false || correct === null) && blank;
      
      const inputElement = (
        <span
          className={`inline-block mx-1 my-1 align-baseline px-2 py-1 text-sm border rounded ${
            correct === true
              ? 'border-green-500 bg-green-50 text-green-900'
              : correct === false
              ? 'border-red-500 bg-red-50 text-red-900'
              : 'border-muted bg-muted/20 text-muted-foreground'
          }`}
        >
          {userAnswer || '—'}
        </span>
      );

      if (showTooltip) {
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              {inputElement}
            </TooltipTrigger>
            <TooltipContent>
              <p>Correct answer: <strong>{blank.correct}</strong></p>
            </TooltipContent>
          </Tooltip>
        );
      }

      return <span key={key}>{inputElement}</span>;
    }
    
    const children = Array.from(el.childNodes).map((child, index) =>
      renderNode(child, `${key}-${index}`)
    );
    const Tag: any = el.tagName.toLowerCase();
    const baseProps: any = {};
    if (el.className) baseProps.className = el.className;
    const voidTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'track', 'area', 'base', 'col', 'embed', 'param', 'wbr']);
    if (voidTags.has(Tag)) {
      return <Tag key={key} {...baseProps} />;
    }
    return (
      <Tag key={key} {...baseProps}>
        {children}
      </Tag>
    );
  };

  if (!container) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold">Your Answers</div>
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: questionText }} />
      </div>
    );
  }

  const content = Array.from(container.childNodes).map((child, index) =>
    renderNode(child, `root-${index}`)
  );

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="text-sm font-semibold">Your Answers</div>
        <div className="text-lg font-medium space-y-1">{content}</div>
        <div className="text-xs text-muted-foreground mt-2">
          Hover over incorrect answers to see the correct answer
        </div>
      </div>
    </TooltipProvider>
  );
}

