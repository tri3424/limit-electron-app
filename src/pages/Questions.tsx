import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Eye, Tag as TagIcon, FileQuestion, Trash2 } from 'lucide-react';
import { db, Question, GlobalGlossaryEntry, normalizeGlossaryMeaning, normalizeGlossaryWord } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { deleteQuestion } from '@/lib/questions';
import { mergeGlobalGlossaryDuplicates } from '@/lib/glossary';
import { MatchingQuestionView } from '@/components/MatchingQuestionView';
import { prepareContentForDisplay } from '@/lib/contentFormatting';
import { renderTypingAnswerMathToHtml } from '@/components/TypingAnswerMathInput';
import { copyTextToClipboard } from '@/utils/codeBlockCopy';
import { toast } from 'sonner';
import { summarizeDifficulty } from '@/lib/intelligenceEngine';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function Questions() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'mcq' | 'text' | 'fill_blanks' | 'matching'>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [mergingGlossary, setMergingGlossary] = useState(false);
  const [highlightQuestionId, setHighlightQuestionId] = useState<string | null>(null);
  const handledScrollRequestRef = useRef<string | null>(null);

  const questions = useLiveQuery(async () => {
    let query = db.questions.toArray();
    return query;
  }, [], [] as Question[]);

  const tags = useLiveQuery(() => db.tags.toArray(), [], []);
  const globalGlossary = useLiveQuery(() => db.globalGlossary.toArray(), [], []);

  // Ensure all questions have a stable code, including older ones created before codes existed
  useEffect(() => {
    if (!questions || !questions.length) return;
    (async () => {
      const updates: { id: string; code: string }[] = [];
      for (const q of questions as Question[]) {
        if (!q.code) {
          const baseId = typeof q.id === 'string' && q.id.length >= 8 ? q.id : String(q.id ?? '');
          const suffix = baseId ? baseId.slice(0, 8) : Math.random().toString(36).slice(2, 10);
          updates.push({ id: q.id, code: `Q-${suffix}` });
        }
      }
      if (updates.length) {
        await db.transaction('rw', db.questions, async () => {
          for (const u of updates) {
            await db.questions.update(u.id, { code: u.code });
          }
        });
      }
    })();
  }, [questions]);

  useEffect(() => {
    const state = location.state as { scrollToQuestionId?: string } | null;
    const targetId = state?.scrollToQuestionId;
    if (!targetId) return;
    if (!questions || !questions.length) return;

    const requestKey = `${location.key}:${targetId}`;
    if (handledScrollRequestRef.current === requestKey) return;

    const exists = questions.some((q) => q.id === targetId);
    if (!exists) return;

    handledScrollRequestRef.current = requestKey;

    const handle = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-question-id="${targetId}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setHighlightQuestionId(targetId);
        window.setTimeout(() => setHighlightQuestionId(null), 1600);
      }
    }, 50);

    // Clear the router state so this scroll/highlight doesn't retrigger on subsequent question list updates.
    navigate(location.pathname + location.search + location.hash, { replace: true, state: null });

    return () => window.clearTimeout(handle);
  }, [location.state, questions, location.key, location.pathname, location.search, location.hash, navigate]);

  // Filter questions
  const normalizedSearchTokens = useMemo(() => {
    return searchQuery
      .trim()
      .split(/\s+/)
      .map(token => normalizeGlossaryWord(token))
      .filter(Boolean);
  }, [searchQuery]);

  const questionTextTokens = useMemo(() => buildQuestionTokenMap(questions || []), [questions]);
  const questionGlossaryTokens = useMemo(() => buildQuestionGlossaryTokenMap(questions || []), [questions]);
  const globalGlossaryTokens = useMemo(() => buildGlobalGlossaryTokenMap(globalGlossary || []), [globalGlossary]);

  const filteredQuestions = (questions?.filter(q => {
    const s = searchQuery.trim().toLowerCase();
    const questionPlainText = extractPlainText(q.text || '').toLowerCase();
    const explanationPlainText = extractPlainText(q.explanation || '').toLowerCase();
    const optionsPlainText = (q.options || [])
      .map((o) => extractPlainText(o.text || ''))
      .join(' ')
      .toLowerCase();
    const tags = (q.tags || []).map((t) => String(t));
    const matchesSearch = !s
      ? true
      : questionPlainText.includes(s) ||
        explanationPlainText.includes(s) ||
        optionsPlainText.includes(s) ||
        tags.some(t => t.toLowerCase().includes(s)) ||
        (q.code ? q.code.toLowerCase().includes(s) : false) ||
        doesQuestionMatchNormalizedSearch(
          q,
          normalizedSearchTokens,
          questionTextTokens,
          questionGlossaryTokens,
          globalGlossaryTokens
        );
    const matchesType = typeFilter === 'all' || q.type === typeFilter;
    const matchesTag = tagFilter === 'all' || tags.includes(tagFilter);
    return matchesSearch && matchesType && matchesTag;
  }) || []).slice().sort((a, b) => {
    const aCreated = a.metadata?.createdAt ?? 0;
    const bCreated = b.metadata?.createdAt ?? 0;
    return bCreated - aCreated; // Newest first
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Questions</h1>
          <p className="text-muted-foreground mt-2">
            Manage and organize your question bank
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setMergingGlossary(true);
              try {
                const merged = await mergeGlobalGlossaryDuplicates();
                toast.success(merged ? `Normalized ${merged} duplicate entr${merged === 1 ? 'y' : 'ies'}.` : 'Glossary already normalized.');
              } catch (error) {
                console.error(error);
                toast.error('Failed to normalize glossary words.');
              } finally {
                setMergingGlossary(false);
              }
            }}
            disabled={mergingGlossary}
          >
            {mergingGlossary ? 'Normalizing...' : 'Normalize Glossary'}
          </Button>
          {selectedIds.length > 0 && (
            <Button variant="destructive" onClick={() => setConfirmDeleteIds(selectedIds.slice())}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete Selected ({selectedIds.length})
            </Button>
          )}
          <Link to="/questions/create">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Question
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={typeFilter} onValueChange={(value: any) => setTypeFilter(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Question type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="mcq">Multiple Choice</SelectItem>
              <SelectItem value="text">Free Text</SelectItem>
              <SelectItem value="fill_blanks">Fill in the Blanks</SelectItem>
              <SelectItem value="matching">Matching</SelectItem>
            </SelectContent>
          </Select>

          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {tags?.map(tag => (
                <SelectItem key={tag.id} value={tag.name}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Questions</p>
              <p className="text-3xl font-bold text-foreground mt-1">{questions.length}</p>
            </div>
            <FileQuestion className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Multiple Choice</p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {questions.filter(q => q.type === 'mcq').length}
              </p>
            </div>
            <FileQuestion className="h-12 w-12 text-accent opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Free Text</p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {questions.filter(q => q.type === 'text').length}
              </p>
            </div>
            <FileQuestion className="h-12 w-12 text-success opacity-20" />
          </div>
        </Card>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {filteredQuestions.length === 0 ? (
          <Card className="p-12 text-center">
            <FileQuestion className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No questions found</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery || typeFilter !== 'all' || tagFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first question to get started'}
            </p>
            <Link to="/questions/create">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Question
              </Button>
            </Link>
          </Card>
        ) : (
          filteredQuestions.map(question => (
            <QuestionCard
              key={question.id}
              question={question}
              selected={selectedIds.includes(question.id)}
              highlighted={highlightQuestionId === question.id}
              onToggleSelected={(checked) => setSelectedIds(prev => checked ? Array.from(new Set([...prev, question.id])) : prev.filter(id => id !== question.id))}
              onDelete={() => setConfirmDeleteIds([question.id])}
              globalGlossary={globalGlossary || []}
            />
          ))
        )}

        {/* Bulk/Single Delete Modal */}
        <Dialog open={!!confirmDeleteIds} onOpenChange={(open) => { if (!open) setConfirmDeleteIds(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Question{(confirmDeleteIds || []).length > 1 ? 's' : ''}</DialogTitle>
              <DialogDescription>
                This action cannot be undone. {confirmDeleteIds?.length || 0} item(s) will be permanently removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDeleteIds(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const ids = confirmDeleteIds || [];
                  for (const id of ids) {
                    await deleteQuestion(id);
                  }
                  setConfirmDeleteIds(null);
                  setSelectedIds([]);
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  selected,
  highlighted,
  onToggleSelected,
  onDelete,
  globalGlossary,
}: {
  question: Question;
  selected: boolean;
  highlighted: boolean;
  onToggleSelected: (checked: boolean) => void;
  onDelete: () => void;
  globalGlossary: GlobalGlossaryEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [glossaryModal, setGlossaryModal] = useState<{ word: string; meanings: string[] } | null>(null);
  const semanticAnalysis = useLiveQuery(
    () => db.questionSemanticAnalyses.where('questionId').equals(question.id).last(),
    [question.id],
  );
  const effectiveTags = semanticAnalysis?.tags;
  const effectiveDifficultyScore = semanticAnalysis?.difficultyScore;
  const effectiveDifficultyBand = semanticAnalysis?.difficultyBand;
  const hasPicture = question.text.toLowerCase().includes('<img');
  const compressedHtml = (() => {
    const withoutImages = question.text.replace(/<img[^>]*>/gi, '');
    return hasPicture ? `${withoutImages} <em>(Picture)</em>` : withoutImages;
  })();
  const combinedGlossary = useMemo(() => {
    const map = new Map<string, { word: string; meanings: string[] }>();
    const addEntry = (word?: string, meaning?: string) => {
      if (!word || !meaning) return;
      const normalizedWord = normalizeGlossaryWord(word);
      const normalizedMeaning = normalizeGlossaryMeaning(meaning);
      if (!normalizedWord || !normalizedMeaning) return;
      const existing = map.get(normalizedWord);
      if (existing) {
        if (!existing.meanings.some((m) => normalizeGlossaryMeaning(m) === normalizedMeaning)) {
          existing.meanings.push(meaning);
        }
      } else {
        map.set(normalizedWord, { word, meanings: [meaning] });
      }
    };

    (question.glossary || []).forEach((entry) => addEntry(entry.word, entry.meaning));
    globalGlossary.forEach((entry) => addEntry(entry.word, entry.meaning));
    return map;
  }, [question.glossary, globalGlossary]);

  const handleGlossaryLookup = useCallback(() => {
    const selection = window.getSelection();
    const selectedWord = selection?.toString().trim();
    if (!selectedWord) return;
    const normalized = normalizeGlossaryWord(selectedWord);
    if (!normalized) return;
    const entry = combinedGlossary.get(normalized);
    if (!entry || entry.meanings.length === 0) return;
    setGlossaryModal({
      word: selectedWord,
      meanings: entry.meanings,
    });
  	}, [combinedGlossary]);

  const shortText = useMemo(() => {
    const tmp = document.createElement('div');
    tmp.innerHTML = compressedHtml;
    const text = (tmp.textContent || '').trim().split(/\s+/).slice(0, 4).join(' ');
    return text || 'Untitled';
  }, [compressedHtml]);

  const previewText = useMemo(() => {
    const tmp = document.createElement('div');
    tmp.innerHTML = compressedHtml;
    const raw = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) return 'Untitled';
    const maxChars = 120;
    if (raw.length <= maxChars) return raw;
    return `${raw.slice(0, maxChars).trim()}.....`;
  }, [compressedHtml]);

  const previewHtml = useMemo(() => {
    const maxChars = 140;
    const normalized = prepareContentForDisplay(compressedHtml);

    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
      return normalized;
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(normalized, 'text/html');

      const blockSelectors = 'p, div, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote';
      doc.body.querySelectorAll(blockSelectors).forEach((el) => {
        const span = doc.createElement('span');
        span.innerHTML = (el as HTMLElement).innerHTML;
        span.appendChild(doc.createTextNode(' '));
        el.replaceWith(span);
      });

      const out = doc.createElement('div');
      let remaining = maxChars;
      let truncated = false;

      const appendNode = (node: Node, parent: HTMLElement) => {
        if (remaining <= 0) {
          truncated = true;
          return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node.textContent || '').replace(/\s+/g, ' ');
          if (!text.trim()) {
            parent.appendChild(doc.createTextNode(' '));
            return;
          }
          const slice = text.slice(0, remaining);
          parent.appendChild(doc.createTextNode(slice));
          remaining -= slice.length;
          if (slice.length < text.length) truncated = true;
          return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const el = node as HTMLElement;

        if (el.closest('.katex')) {
          if (parent.querySelector('.katex')) return;
          const katexRoot = el.closest('.katex') as HTMLElement;
          if (katexRoot) {
            parent.appendChild(katexRoot.cloneNode(true));
            const approx = (katexRoot.textContent || '').length;
            remaining = Math.max(0, remaining - Math.min(approx, remaining));
          }
          return;
        }

        const tag = el.tagName.toLowerCase();
        const clone = doc.createElement(tag === 'span' ? 'span' : tag);
        if (el.getAttribute('class')) clone.setAttribute('class', el.getAttribute('class') as string);

        parent.appendChild(clone);
        Array.from(el.childNodes).forEach((child) => appendNode(child, clone));
      };

      Array.from(doc.body.childNodes).forEach((child) => appendNode(child, out));

      if (truncated) {
        out.appendChild(doc.createTextNode('…'));
      }

      return out.innerHTML.trim();
    } catch {
      return normalized;
    }
  }, [compressedHtml]);

  return (
    <Card
      data-question-id={question.id}
      className={`p-6 hover:shadow-md transition-shadow scroll-mt-24 ${highlighted ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <Checkbox checked={selected} onCheckedChange={(v: any) => onToggleSelected(!!v)} />
            <div
              className="text-foreground text-lg font-semibold line-clamp-2 content-html"
              dangerouslySetInnerHTML={{ __html: previewHtml || previewText }}
            />
          </div>
          {/* Question text */}
          

          {/* Meta info */}
          <div className="flex items-center gap-4 flex-wrap">
            {question.code && (
              								<Tooltip>
									<TooltipTrigger asChild>
										<Badge
											variant="outline"
											className="font-mono text-[10px] cursor-pointer"
											onClick={(e) => {
												e.stopPropagation();
												void copyTextToClipboard(question.code!, 'Question code copied!');
											}}
										>
											{question.code}
										</Badge>
									</TooltipTrigger>
									<TooltipContent>Click to copy</TooltipContent>
								</Tooltip>
            )}
            <Badge 
              variant={question.type === 'mcq' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {question.type === 'mcq'
                ? 'Multiple Choice'
                : question.type === 'text'
                  ? 'Free Text'
                  : question.type === 'fill_blanks'
                    ? 'Fill in the Blanks'
                    : 'Matching'}
            </Badge>

            {(question.metadata.difficultyBand || question.metadata.difficulty) && (
              <Badge variant="outline" className="text-xs">
                {question.metadata.difficultyBand
                  ? question.metadata.difficultyBand
                  : summarizeDifficulty(
                      typeof question.metadata.difficulty === 'object'
                        ? (question.metadata.difficulty as any)
                        : undefined,
                    ) || String(question.metadata.difficulty)}
              </Badge>
            )}

            {semanticAnalysis?.difficultyBand && (
              <Badge variant="outline" className="text-xs">
                {semanticAnalysis.difficultyBand.replace(/_/g, ' ')}
                {typeof semanticAnalysis.difficultyScore === 'number'
                  ? ` (${Math.round(semanticAnalysis.difficultyScore * 100)}/100)`
                  : ''}
              </Badge>
            )}

            {question.tags.length > 0 && (
              <div className="flex items-center gap-2">
                <TagIcon className="h-3 w-3 text-muted-foreground" />
                {question.tags.slice(0, 3).map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {question.tags.length > 3 && (
                  <span className="text-xs text-muted-foreground">
                    +{question.tags.length - 3} more
                  </span>
                )}
              </div>
            )}

            {effectiveTags?.length ? (
              <div className="flex items-center gap-2">
                <TagIcon className="h-3 w-3 text-muted-foreground" />
                {effectiveTags.slice(0, 3).map((t) => (
                  <Badge key={t.tagId} variant="secondary" className="text-xs">
                    {t.tagName}
                  </Badge>
                ))}
                {effectiveTags.length > 3 && (
                  <span className="text-xs text-muted-foreground">
                    +{effectiveTags.length - 3} more
                  </span>
                )}
              </div>
            ) : null}

            {question.type === 'mcq' && question.options && (
              <div className="text-sm text-muted-foreground">
                {question.options.length} options
              </div>
            )}
          </div>

        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap md:flex-nowrap">
          <Button variant="destructive" size="icon" onClick={onDelete} aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" aria-label="View">
                <Eye className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-6xl">
              <DialogHeader>
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle>Question Details</DialogTitle>
                </div>
                <DialogDescription className="sr-only">Question details and actions</DialogDescription>
              </DialogHeader>
              <ScrollArea className="h-[70vh]">
                <div className="space-y-4 pr-2" onDoubleClick={handleGlossaryLookup}>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    {question.code && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              void copyTextToClipboard(question.code!, 'Question code copied!');
                            }}
                          >
                            Code: <span className="font-semibold text-foreground">{question.code}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Click to copy</TooltipContent>
                      </Tooltip>
                    )}
                    <div>Type: <span className="font-semibold text-foreground uppercase">{question.type}</span></div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Question</div>
                    <div className="prose prose-base max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(question.text) }} />
                  </div>
                  {question.type === 'mcq' && question.options && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Options</div>
                      <div className="space-y-3">
                        {question.options.map((o) => {
                          const isCorrect = Array.isArray(question.correctAnswers) && question.correctAnswers.includes(o.id);
                          return (
                            <div
                              key={o.id}
                              className={`rounded-md border p-3 text-base ${isCorrect ? 'border-green-500 bg-green-50' : ''}`}
                            >
                              <div className="content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(o.text) }} />
                              {Array.isArray((o as any).images) && (o as any).images.length > 0 && (
                                <div className="mt-2 space-y-2">
                                  {(o as any).images.map((src: string, idx: number) => (
                                    <img
                                      key={`${src}-${idx}`}
                                      src={src}
                                      alt={`option-figure-${idx + 1}`}
                                      className="max-w-full rounded-md border"
                                      loading="lazy"
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {question.type === 'fill_blanks' && question.fillBlanks && question.fillBlanks.blanks.length > 0 && (
                    <div className="rounded-md border p-3">
                      <div className="text-sm font-semibold mb-1">Blanks</div>
                      <ul className="list-disc pl-4 space-y-1 text-sm">
                        {question.fillBlanks.blanks.map((b, idx) => (
                          <li key={b.id}>Blank {idx + 1}: {b.correct}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {question.type === 'matching' && question.matching && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Matching Pairs</div>
                      <MatchingQuestionView question={question} />
                    </div>
                  )}
                  {question.type !== 'mcq' && question.type !== 'fill_blanks' && question.type !== 'matching' && question.correctAnswers && question.correctAnswers.length > 0 && (
                    <div className="rounded-md border p-3">
                      <div className="text-sm font-semibold mb-1">Correct Answer</div>
                      {question.type === 'text' ? (
                        <div className="text-sm">
                          {question.correctAnswers.map((ans, idx) => (
                            <span key={`${ans}-${idx}`}>
                              {idx > 0 ? ', ' : ''}
                              <span className="content-html" dangerouslySetInnerHTML={{ __html: renderTypingAnswerMathToHtml(ans) }} />
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm">{question.correctAnswers.join(', ')}</div>
                      )}
                    </div>
                  )}
                  {question.explanation && (
                    <div className="rounded-md border p-3 bg-muted/30">
                      <div className="text-sm font-semibold mb-1">Explanation</div>
                      <div className="prose prose-base max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(question.explanation || '') }} />
                    </div>
                  )}
                  {question.glossary && question.glossary.length > 0 && (
                    <div className="rounded-md border p-3 bg-muted/20">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div>
                          <div className="text-sm font-semibold">Glossary</div>
                          <p className="text-xs text-muted-foreground">Double-click a highlighted word within the question to view its meaning instantly.</p>
                        </div>
                      </div>
                      <ul className="space-y-2 text-sm">
                        {question.glossary.map((entry) => (
                          <li key={entry.id} className="border rounded-md p-2 bg-background/60">
                            <div className="font-semibold text-foreground">{entry.word}</div>
                            <div className="text-muted-foreground whitespace-pre-wrap">{entry.meaning}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {(question.metadata.difficultyBand || question.metadata.difficulty) && (
                      <Badge variant="outline" className="text-xs">
                        {question.metadata.difficultyBand || question.metadata.difficulty}
                      </Badge>
                    )}
                    {semanticAnalysis?.difficultyBand && (
                      <Badge variant="outline" className="text-xs">
                        {semanticAnalysis.difficultyBand.replace(/_/g, ' ')}
                        {typeof semanticAnalysis.difficultyScore === 'number'
                          ? ` (${Math.round(semanticAnalysis.difficultyScore * 100)}/100)`
                          : ''}
                      </Badge>
                    )}
                    {question.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                    {semanticAnalysis?.tags?.map((t) => (
                      <Badge key={t.tagId} variant="secondary" className="text-xs">{t.tagName}</Badge>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>

          <Link to={`/questions/edit/${question.id}`}>
            <Button variant="outline" size="icon" aria-label="Edit">
              <Edit className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
      <Dialog open={!!glossaryModal} onOpenChange={(open) => { if (!open) setGlossaryModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{glossaryModal?.word}</DialogTitle>
            <DialogDescription>Referenced word meaning</DialogDescription>
          </DialogHeader>
          <ul className="list-disc pl-4 space-y-2 text-sm text-foreground">
            {glossaryModal?.meanings.map((meaning, idx) => (
              <li key={`${meaning}-${idx}`} className="whitespace-pre-wrap">
                {meaning}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" onClick={() => setGlossaryModal(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function doesQuestionMatchNormalizedSearch(
  question: Question,
  normalizedTokens: string[],
  questionTextTokens: Map<string, Set<string>>,
  localGlossaryTokens: Map<string, Set<string>>,
  globalGlossaryTokens: Map<string, Set<string>>
) {
  if (!normalizedTokens.length) return true;
  const textTokens = questionTextTokens.get(question.id);
  const localTokens = localGlossaryTokens.get(question.id);
  const globalTokens = globalGlossaryTokens.get(question.id);
  return normalizedTokens.some(
    (token) =>
      (textTokens && textTokens.has(token)) ||
      (localTokens && localTokens.has(token)) ||
      (globalTokens && globalTokens.has(token))
  );
}

function buildQuestionTokenMap(questions: Question[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  questions.forEach((question) => {
    const tokens = new Set<string>();
    addTextTokens(tokens, question.text);
    question.options?.forEach((opt) => addTextTokens(tokens, opt.text));
    addTextTokens(tokens, question.explanation);
    question.tags?.forEach((tag) => {
      const normalized = normalizeGlossaryWord(tag);
      if (normalized) tokens.add(normalized);
    });
    map.set(question.id, tokens);
  });
  return map;
}

function buildQuestionGlossaryTokenMap(questions: Question[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  questions.forEach((question) => {
    const set = new Set<string>();
    (question.glossary || []).forEach((entry) => {
      const normalized = normalizeGlossaryWord(entry.word);
      if (normalized) set.add(normalized);
    });
    if (set.size) {
      map.set(question.id, set);
    }
  });
  return map;
}

function buildGlobalGlossaryTokenMap(entries: GlobalGlossaryEntry[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  entries.forEach((entry) => {
    const normalized = normalizeGlossaryWord(entry.word);
    if (!normalized) return;
    (entry.questionIds || []).forEach((questionId) => {
      const set = map.get(questionId) || new Set<string>();
      set.add(normalized);
      map.set(questionId, set);
    });
  });
  return map;
}

function addTextTokens(target: Set<string>, html?: string) {
  if (!html) return;
  const text = extractPlainText(html);
  text
    .split(/\s+/)
    .map((word) => normalizeGlossaryWord(word))
    .filter(Boolean)
    .forEach((token) => target.add(token));
}

function extractPlainText(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ');
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

