import { useMemo } from 'react';
import { prepareContentForDisplay } from '@/lib/contentFormatting';

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
  const previewHtml = useMemo(() => {
    const prepared = prepareContentForDisplay(html);
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
      return prepared.replace(/<img\b[^>]*>/gi, '');
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(prepared, 'text/html');
      doc.body.querySelectorAll('img, figure, picture, svg').forEach((el) => el.remove());
      return doc.body.innerHTML;
    } catch {
      return prepared.replace(/<img\b[^>]*>/gi, '');
    }
  }, [html]);

  return (
    <div
      className="tk-question-snippet text-sm font-medium prose prose-sm max-w-none overflow-hidden content-html line-clamp-2"
      dangerouslySetInnerHTML={{ __html: previewHtml || (questionType ? '' : '') }}
    />
  );
}

