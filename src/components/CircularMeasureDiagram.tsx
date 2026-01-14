import { useMemo } from 'react';

export default function CircularMeasureDiagram(props: {
  svg: string;
  altText?: string;
  className?: string;
}) {
  const { svg, altText, className } = props;

  const content = useMemo(() => {
    // Assumes svg is generated internally by our generator.
    return { __html: svg } as const;
  }, [svg]);

  return (
    <div
      className={className ?? 'w-full flex justify-center'}
      role="img"
      aria-label={altText ?? 'Circular measure diagram'}
    >
      <div className="w-full max-w-[520px]">
        <div className="w-full [&_svg]:w-full [&_svg]:h-auto" dangerouslySetInnerHTML={content} />
      </div>
    </div>
  );
}
