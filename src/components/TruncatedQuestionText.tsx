import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
  const [isExpanded, setIsExpanded] = useState(false);

  // Only truncate fill-in-the-blanks questions
  if (questionType !== 'fill_blanks') {
    return (
      <div
        className="tk-question-snippet text-sm font-medium prose prose-sm max-w-none overflow-hidden"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Extract plain text for length calculation
  const extractText = (htmlString: string): string => {
    if (typeof window === 'undefined') return htmlString;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    return doc.body.textContent || '';
  };

  const plainText = extractText(html);
  const shouldTruncate = plainText.length > maxLength;

  if (!shouldTruncate) {
    return (
      <div
        className="tk-question-snippet text-sm font-medium prose prose-sm max-w-none overflow-hidden"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  if (isExpanded) {
    return (
      <div className="space-y-2">
        <div
          className="tk-question-snippet text-sm font-medium prose prose-sm max-w-none overflow-hidden"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(false)}
          className="h-auto p-1 text-xs"
        >
          <ChevronUp className="h-3 w-3 mr-1" />
          Show less
        </Button>
      </div>
    );
  }

  // Truncate HTML while preserving structure
  const truncateHtml = (htmlString: string, maxLength: number): string => {
    const text = extractText(htmlString);
    if (text.length <= maxLength) return htmlString;
    
    // Find a good truncation point (try to break at word boundary)
    let truncateAt = maxLength;
    for (let i = maxLength; i > maxLength - 20 && i > 0; i--) {
      if (text[i] === ' ' || text[i] === '.' || text[i] === ',' || text[i] === ';') {
        truncateAt = i;
        break;
      }
    }
    
    // Extract truncated text and add ellipsis
    const truncatedText = text.substring(0, truncateAt);
    
    // Try to preserve some HTML structure, but keep it simple
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const body = doc.body;
    
    // Simple approach: just show truncated plain text with ellipsis
    return truncatedText + '...';
  };

  const truncatedText = truncateHtml(html, maxLength);

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium prose prose-sm max-w-none">
        {truncatedText}
        <span className="text-muted-foreground">...</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="h-auto p-1 text-xs"
      >
        <ChevronDown className="h-3 w-3 mr-1" />
        View full question
      </Button>
    </div>
  );
}

