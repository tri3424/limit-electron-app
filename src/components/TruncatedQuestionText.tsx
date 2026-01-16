import { useMemo } from 'react';

interface TruncatedQuestionTextProps {
  html: string;
  questionType: 'mcq' | 'text' | 'fill_blanks' | 'matching';
  maxLength?: number;
}

/**
 * Component that truncates long fill-in-the-blanks questions and shows full text on click
 */
export function TruncatedQuestionText({ 
  html, 
  questionType, 
  maxLength = 150 
}: TruncatedQuestionTextProps) {
  const extractText = (htmlString: string): string => {
    if (typeof window === 'undefined') return String(htmlString ?? '');
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(htmlString ?? ''), 'text/html');
    return doc.body.textContent || '';
  };

  const previewText = useMemo(() => {
    const text = extractText(html).replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    let truncateAt = maxLength;
    for (let i = maxLength; i > maxLength - 20 && i > 0; i--) {
      if (text[i] === ' ' || text[i] === '.' || text[i] === ',' || text[i] === ';') {
        truncateAt = i;
        break;
      }
    }
    return text.substring(0, truncateAt).trimEnd() + '...';
  }, [html, maxLength]);

  return (
    <div className="tk-question-snippet text-sm font-medium prose prose-sm max-w-none overflow-hidden">
      {previewText || (questionType ? '' : '')}
    </div>
  );
}

