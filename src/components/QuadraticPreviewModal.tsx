import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Katex } from '@/components/Katex';
import { PolynomialLongDivision } from '@/components/PolynomialLongDivision';
import { QuadraticFactorizationQuestion } from '@/lib/practiceGenerators/quadraticFactorization';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: QuadraticFactorizationQuestion | null;
};

export function QuadraticPreviewModal({ open, onOpenChange, question }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>Quadratic equations — factorisation method</DialogDescription>
        </DialogHeader>

        {question ? (
          <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Question</div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <Katex latex={question.katexQuestion} displayMode />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Explanation</div>
                <div className="rounded-md border bg-background p-3">
                  <div className="space-y-3">
                    {question.katexExplanation.map((b, idx) =>
                      b.kind === 'text' ? (
                        <div key={idx} className="text-sm leading-relaxed text-foreground">
                          {b.content}
                        </div>
                      ) : b.kind === 'long_division' ? (
                        <div key={idx} className="py-2">
                          <PolynomialLongDivision
                            divisorLatex={b.divisorLatex}
                            dividendLatex={b.dividendLatex}
                            quotientLatex={b.quotientLatex}
                            steps={b.steps}
                          />
                        </div>
                      ) : b.kind === 'graph' ? (
                        <div key={idx} className="text-sm leading-relaxed text-foreground">
                          {b.altText}
                        </div>
                      ) : (
                        <div key={idx} className="overflow-x-auto">
                          <Katex latex={b.content} displayMode={b.displayMode} />
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Solutions</div>
                <div className="rounded-md border bg-muted/20 p-3">
                  {question.metadata.repeatedRoot ? (
                    <div className="text-sm">
                      <Katex latex={`x = ${question.metadata.solutionsLatex[0]}\\\\\\text{(repeated root)}`} displayMode />
                    </div>
                  ) : (
                    <div className="text-sm">
                      <Katex latex={`x = ${question.metadata.solutionsLatex[0]},\\; x = ${question.metadata.solutionsLatex[1]}`} displayMode />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="text-sm text-muted-foreground">Generate a question to preview.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
