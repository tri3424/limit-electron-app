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
  return (
    <div className="w-full overflow-x-auto">
      <div className="inline-block min-w-fit text-2xl leading-tight">
        <div className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 items-end">
          <div />
          <div className="justify-self-end">
            <Katex latex={quotientLatex} />
          </div>

          <div className="pb-1">
            <Katex latex={divisorLatex} />
          </div>
          <div className="border-l-4 border-t-4 pl-4 pt-3 pb-2">
            <Katex latex={dividendLatex} />
          </div>

          {steps.map((s, idx) => (
            <div key={idx} className="contents">
              <div />
              <div className="border-l-4 pl-4">
                <div className="border-t-4 pt-3">
                  <div className="flex items-baseline gap-2">
                    <div className="text-2xl select-none">−</div>
                    <div className="flex-1">
                      <Katex latex={`(${s.subLatex})`} />
                    </div>
                  </div>
                </div>
                <div className="border-t-4 mt-3 pt-3">
                  <Katex latex={s.remainderLatex} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
