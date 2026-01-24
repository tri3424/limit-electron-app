import { Katex } from '@/components/Katex';

type Step = {
  subLatex: string;
  remainderLatex: string;
};

type Props = {
  divisorLatex: string;
  dividendLatex: string;
  quotientLatex: string;
  steps: Step[];
};

export function PolynomialLongDivision({ divisorLatex, dividendLatex, quotientLatex, steps }: Props) {
  const divisorRaw = String(divisorLatex ?? '').trim();
  const dividendRaw = String(dividendLatex ?? '').trim();
  const quotientRaw = String(quotientLatex ?? '').trim();
  const isNumeric =
    /^\d+$/.test(divisorRaw) &&
    /^\d+$/.test(dividendRaw) &&
    /^\d+$/.test(quotientRaw) &&
    (steps ?? []).every((s) => /^\d+$/.test(String(s?.subLatex ?? '').trim()) && /^\d+$/.test(String(s?.remainderLatex ?? '').trim()));

  const padLeft = (s: string, n: number) => {
    const t = String(s ?? '');
    if (t.length >= n) return t;
    return ' '.repeat(n - t.length) + t;
  };

  if (isNumeric) {
    const len = dividendRaw.length;
    const digitW = '1.05em';

    return (
      <div className="w-full overflow-x-auto">
        <div className="inline-block min-w-fit text-3xl leading-tight font-mono">
          <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 items-end">
            <div />
            <div className="justify-self-end">
              <div style={{ width: `calc(${len} * ${digitW})` }} className="text-right">
                {padLeft(quotientRaw, len)}
              </div>
            </div>

            <div className="pb-1 pr-1">{divisorRaw}</div>
            <div
              className="relative pl-4 pt-2"
              style={{ width: `calc(${len} * ${digitW} + 1.25rem)` }}
            >
              <div className="absolute inset-y-0 left-0 w-[10px] border-l-4 border-t-4 border-amber-500 rounded-tl-lg" />
              <div className="relative">
                <div style={{ width: `calc(${len} * ${digitW})` }} className="text-right">
                  {padLeft(dividendRaw, len)}
                </div>
                <div className="pointer-events-none absolute inset-0 flex" aria-hidden="true">
                  {Array.from({ length: Math.max(0, len - 1) }).map((_, i) => (
                    <div
                      // vertical dotted guides between digit columns
                      key={i}
                      className="h-full border-l border-dotted border-neutral-400/70"
                      style={{
                        position: 'absolute',
                        left: `calc(${i + 1} * ${digitW})`,
                        top: 0,
                        bottom: 0,
                      }}
                    />
                  ))}
                </div>
              </div>

              {steps.map((s, idx) => {
                const sub = String(s.subLatex ?? '').trim();
                const rem = String(s.remainderLatex ?? '').trim();
                return (
                  <div key={idx} className="mt-2">
                    <div className="flex items-baseline">
                      <div className="w-6 text-right pr-1 select-none">−</div>
                      <div className="flex-1">
                        <div
                          className="border-b-2 border-amber-500 pb-1 text-right"
                          style={{ width: `calc(${len} * ${digitW})` }}
                        >
                          {padLeft(sub, len)}
                        </div>
                      </div>
                    </div>
                    <div className="pl-6">
                      <div style={{ width: `calc(${len} * ${digitW})` }} className="text-right">
                        {padLeft(rem, len)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="inline-block min-w-fit text-xl leading-snug">
        <div className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 items-start">
          <div />
          <div className="justify-self-end pb-1">
            <Katex latex={quotientLatex} />
            <div className="h-px bg-border mt-1" />
          </div>

          <div className="pt-4 pr-2 text-right">
            <Katex latex={divisorLatex} />
          </div>
          <div className="relative pl-5 pt-3">
            <div className="absolute left-0 top-0 bottom-0 w-[12px] border-l-2 border-t-2 border-border rounded-tl-md" />
            <div className="pb-2">
              <Katex latex={dividendLatex} />
            </div>

            <div className="space-y-3">
              {steps.map((s, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-baseline gap-2 text-muted-foreground">
                    <div className="w-5 text-right select-none">−</div>
                    <div className="flex-1">
                      <Katex latex={String.raw`(${s.subLatex})`} />
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="pl-7">
                    <Katex latex={s.remainderLatex} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
