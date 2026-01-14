import katex from 'katex';
import { useMemo } from 'react';

type Props = {
  latex: string;
  displayMode?: boolean;
  className?: string;
};

export function Katex({ latex, displayMode, className }: Props) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: !!displayMode,
        strict: 'warn',
        trust: false,
      });
    } catch {
      return '';
    }
  }, [latex, displayMode]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
