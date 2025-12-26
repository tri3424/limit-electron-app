import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation } from 'react-router-dom';
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
import { v4 as uuidv4 } from 'uuid';
import { mapScoreToBand } from '@/lib/semanticEngine';
import { generateDeterministicExplanationHtml } from '@/lib/explanationEngine';

export default function Questions() {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'mcq' | 'text' | 'fill_blanks' | 'matching'>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [mergingGlossary, setMergingGlossary] = useState(false);
  const [highlightQuestionId, setHighlightQuestionId] = useState<string | null>(null);

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

    const exists = questions.some((q) => q.id === targetId);
    if (!exists) return;

    const handle = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-question-id="${targetId}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setHighlightQuestionId(targetId);
        window.setTimeout(() => setHighlightQuestionId(null), 1600);
      }
    }, 50);

    return () => window.clearTimeout(handle);
  }, [location.state, questions]);

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
	const [aiExplanationOpen, setAiExplanationOpen] = useState(false);
	const [aiExplanationHtml, setAiExplanationHtml] = useState('');
	const [aiExplanationLoading, setAiExplanationLoading] = useState(false);
	const [aiExplanationApplying, setAiExplanationApplying] = useState(false);
	const [aiExplanationRegen, setAiExplanationRegen] = useState(0);
	const [tutorChatOpen, setTutorChatOpen] = useState(false);
	const [tutorChatInput, setTutorChatInput] = useState('');
	const [tutorChatLoading, setTutorChatLoading] = useState(false);
	const [tutorChatMessages, setTutorChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const semanticAnalysis = useLiveQuery(
    () => db.questionSemanticAnalyses.where('questionId').equals(question.id).last(),
    [question.id],
  );
  const semanticOverride = useLiveQuery(
    () => db.questionSemanticOverrides.where('questionId').equals(question.id).last(),
    [question.id],
  );
  const [overrideTagsText, setOverrideTagsText] = useState('');
  const [overrideDifficultyText, setOverrideDifficultyText] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);

  useEffect(() => {
    if (!semanticOverride) {
      setOverrideTagsText('');
      setOverrideDifficultyText('');
      return;
    }
    const tags = semanticOverride.tags?.applied?.map((t) => t.tagName).filter(Boolean) ?? [];
    setOverrideTagsText(tags.join(', '));
    if (typeof semanticOverride.difficulty?.difficultyScore === 'number') {
      setOverrideDifficultyText(String(semanticOverride.difficulty.difficultyScore));
    } else {
      setOverrideDifficultyText('');
    }
  }, [semanticOverride]);

  const effectiveTags = semanticOverride?.tags?.applied?.length
    ? semanticOverride.tags.applied
    : semanticAnalysis?.tags;
  const effectiveDifficultyScore =
    typeof semanticOverride?.difficulty?.difficultyScore === 'number'
      ? semanticOverride.difficulty.difficultyScore
      : semanticAnalysis?.difficultyScore;
  const effectiveDifficultyBand = semanticOverride?.difficulty?.difficultyBand || semanticAnalysis?.difficultyBand;
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

	const generateAiExplanation = useCallback(
		async (regenIndex: number) => {
			setAiExplanationLoading(true);
			try {
				const api = window.offlineAi;
				if (api && typeof api.reasoningStatus === 'function' && typeof api.explain === 'function') {
					const st = await api.reasoningStatus();
					if (st.available) {
						const qPlain = extractPlainText(question.text || '').trim();
						const tags = (semanticAnalysis?.tags || []).slice(0, 8).map((t) => `${t.tagName} (${Math.round((t.score ?? 0) * 100)}%)`);
						const fallbackTags = (question.tags || []).slice(0, 12);

						const blocks: string[] = [];
						blocks.push(`Question type: ${question.type}`);
						blocks.push(`Question:\n${qPlain}`);
						if (question.type === 'mcq' && Array.isArray(question.options)) {
							blocks.push(
								`Options:\n${question.options
									.map((o) => `- (${o.id}) ${extractPlainText(o.text || '').trim()}`)
									.join('\n')}`,
							);
							if (Array.isArray(question.correctAnswers) && question.correctAnswers.length) {
								const correctIds = new Set(question.correctAnswers);
								const correctTexts = question.options
									.filter((o) => correctIds.has(o.id))
									.map((o) => extractPlainText(o.text || '').trim());
								blocks.push(`Correct answer(s): ${correctTexts.length ? correctTexts.join(' | ') : question.correctAnswers.join(', ')}`);
							}
						}
						if (question.type === 'fill_blanks' && question.fillBlanks?.blanks?.length) {
							blocks.push(`Blanks (correct): ${question.fillBlanks.blanks.map((b) => b.correct).join(' | ')}`);
						}
						if (question.type === 'matching' && question.matching?.pairs?.length) {
							blocks.push(
								`Matching pairs:\n${question.matching.pairs
									.map((p) => `- ${extractPlainText(p.leftText || '').trim()} => ${extractPlainText(p.rightText || '').trim()}`)
									.join('\n')}`,
							);
						}
						if (tags.length) blocks.push(`Suggested topics/tags: ${tags.join(', ')}`);
						if (fallbackTags.length) blocks.push(`Existing question tags: ${fallbackTags.join(', ')}`);
						if (semanticAnalysis?.difficultyBand) blocks.push(`Difficulty: ${String(semanticAnalysis.difficultyBand).replace(/_/g, ' ')}`);

						const prompt = [
							'You are an offline tutor. Generate a high-quality explanation tailored to the question.',
							'Rules:',
							'- Use KaTeX-friendly LaTeX: inline $...$ and display $$...$$.',
							'- Explain in a topic-aware way (biology/chemistry/physics/math etc).',
							'- Prefer concise but complete reasoning, step-by-step where applicable.',
							'- If multiple correct answers are possible, mention that.',
							'- Output plain text or markdown (no code blocks).',
							'',
							`Variation seed: ${regenIndex}`,
							'',
							blocks.join('\n\n'),
						].join('\n');

						const res = await api.explain({ prompt, maxTokens: 800, temperature: 0.7, seed: 0 });
						setAiExplanationHtml(prepareContentForDisplay(res.text || ''));
						return;
					}
				}

				const html = await generateDeterministicExplanationHtml({
					question,
					analysis: semanticAnalysis || null,
					regenerateIndex: regenIndex,
				});
				setAiExplanationHtml(html);
			} finally {
				setAiExplanationLoading(false);
			}
		},
		[question, semanticAnalysis],
	);

	const applyAiExplanationToQuestion = useCallback(async () => {
		if (!aiExplanationHtml) return;
		setAiExplanationApplying(true);
		try {
			await db.questions.update(question.id, {
				explanation: aiExplanationHtml,
				metadata: {
					...(question.metadata || ({} as any)),
					updatedAt: Date.now(),
				},
			});
			toast.success('Explanation saved to question');
		} catch (e) {
			console.error(e);
			toast.error('Failed to save explanation');
		} finally {
			setAiExplanationApplying(false);
		}
	}, [aiExplanationHtml, question.id, question.metadata]);

	const sendTutorChat = useCallback(async () => {
		const msg = tutorChatInput.trim();
		if (!msg) return;
		setTutorChatInput('');
		setTutorChatLoading(true);
		try {
			const api = window.offlineAi;
			if (!api || typeof api.chat !== 'function' || typeof api.reasoningStatus !== 'function') {
				toast.error('Tutor chat is only available in the Electron app');
				return;
			}
			const st = await api.reasoningStatus();
			if (!st.available) {
				toast.error(`Tutor chat unavailable: ${st.reason}`);
				return;
			}

			const questionPlain = extractPlainText(question.text || '').trim();
			const typeLine = `Question type: ${question.type}`;
			const optionLines = question.type === 'mcq' && Array.isArray(question.options)
				? `Options:\n${question.options.map((o) => `- (${o.id}) ${extractPlainText(o.text || '').trim()}`).join('\n')}`
				: '';
			const system = [
				'You are an offline tutor. Use KaTeX-friendly LaTeX: inline $...$ and display $$...$$.',
				'Be correct, explain clearly, and adapt to the subject/topic.',
				'If unsure, say so and ask a clarifying question.',
				'',
				'Context:',
				typeLine,
				`Question:\n${questionPlain}`,
				optionLines,
			].filter(Boolean).join('\n\n');

			const nextMessages = [...tutorChatMessages, { role: 'user', content: msg }];
			setTutorChatMessages(nextMessages);
			const res = await api.chat({
				system,
				messages: nextMessages,
				maxTokens: 512,
				temperature: 0.7,
				seed: 0,
			});
			setTutorChatMessages([...nextMessages, { role: 'assistant', content: res.text || '' }]);
		} catch (e) {
			console.error(e);
			toast.error('Tutor chat failed');
		} finally {
			setTutorChatLoading(false);
		}
	}, [question.text, tutorChatInput, tutorChatMessages]);

	useEffect(() => {
		if (!aiExplanationOpen) return;
		if (aiExplanationHtml) return;
		void generateAiExplanation(aiExplanationRegen);
	}, [aiExplanationOpen, aiExplanationHtml, aiExplanationRegen, generateAiExplanation]);

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
              <Badge
                variant="outline"
                className="text-xs cursor-pointer select-none"
                onClick={(e) => {
                  e.stopPropagation();
                  void copyTextToClipboard(question.code!, 'Question code copied!');
                }}
                title="Click to copy"
              >
                {question.code}
              </Badge>
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

            {semanticOverride?.difficulty?.difficultyBand && (
              <Badge variant="default" className="text-xs">
                Override: {semanticOverride.difficulty.difficultyBand.replace(/_/g, ' ')}
                {typeof semanticOverride.difficulty.difficultyScore === 'number'
                  ? ` (${Math.round(semanticOverride.difficulty.difficultyScore * 100)}/100)`
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
                  <Badge key={t.tagId} variant={semanticOverride?.tags?.applied?.length ? 'default' : 'secondary'} className="text-xs">
                    {semanticOverride?.tags?.applied?.length ? `Override: ${t.tagName}` : t.tagName}
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
            <DialogContent className="max-w-5xl">
              <DialogHeader>
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle>Question Details</DialogTitle>
                  <div className="flex items-center gap-2">
                    <Dialog open={tutorChatOpen} onOpenChange={(v) => {
                      setTutorChatOpen(v);
                      if (!v) {
                        setTutorChatInput('');
                        setTutorChatLoading(false);
                        setTutorChatMessages([]);
                      }
                    }}>
                    <DialogTrigger asChild>
                      <Button type="button" size="sm" variant="outline">
                        Tutor Chat
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>Tutor Chat</DialogTitle>
                        <DialogDescription>
                          Runs locally (Electron only). Uses $...$ / $$...$$ for math.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="rounded-md border p-3 bg-muted/20 h-[46vh] overflow-auto space-y-3">
                        {tutorChatMessages.length ? (
                          tutorChatMessages.map((m, idx) => (
                            <div key={idx}>
                              <div className="text-xs text-muted-foreground mb-1">{m.role === 'user' ? 'You' : 'Tutor'}</div>
                              {m.role === 'assistant' ? (
                                <div className="prose prose-sm max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(m.content) }} />
                              ) : (
                                <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-muted-foreground">Ask a question about this question…</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={tutorChatInput}
                          onChange={(e) => setTutorChatInput(e.target.value)}
                          placeholder="Type your question…"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void sendTutorChat();
                          }}
                        />
                        <Button type="button" disabled={tutorChatLoading} onClick={() => void sendTutorChat()}>
                          {tutorChatLoading ? 'Sending…' : 'Send'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={aiExplanationOpen} onOpenChange={(v) => {
                    setAiExplanationOpen(v);
                    if (!v) {
                      setAiExplanationLoading(false);
                      setAiExplanationHtml('');
                      setAiExplanationRegen(0);
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button type="button" size="sm" variant="outline">
                        AI Explanation
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>AI Explanation</DialogTitle>
                        <DialogDescription>
                          Generated locally. You can regenerate as many times as you want.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          {semanticAnalysis?.modelId ? (
                            <>Model: <span className="font-mono text-foreground">{semanticAnalysis.modelId}</span></>
                          ) : (
                            <>Model: <span className="text-foreground">Offline (deterministic)</span></>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={!aiExplanationHtml || aiExplanationLoading || aiExplanationApplying}
                            onClick={applyAiExplanationToQuestion}
                          >
                            {aiExplanationApplying ? 'Saving…' : 'Apply to Question'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={aiExplanationLoading}
                            onClick={async () => {
                              const next = aiExplanationRegen + 1;
                              setAiExplanationRegen(next);
                              await generateAiExplanation(next);
                            }}
                          >
                            {aiExplanationLoading ? 'Generating…' : 'Regenerate'}
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-md border p-3 bg-muted/20">
                        {aiExplanationHtml ? (
                          <div className="content-html" dangerouslySetInnerHTML={{ __html: aiExplanationHtml }} />
                        ) : (
                          <div className="text-sm text-muted-foreground">No explanation generated yet.</div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </DialogHeader>
            <ScrollArea className="h-[70vh]">
              <div className="space-y-4 pr-2" onDoubleClick={handleGlossaryLookup}>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {question.code && (
                    <button
                      type="button"
                      className="font-mono cursor-pointer select-none text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyTextToClipboard(question.code!, 'Question code copied!');
                      }}
                      title="Click to copy"
                    >
                      Code: <span className="font-semibold text-foreground">{question.code}</span>
                    </button>
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
                  {semanticOverride?.difficulty?.difficultyBand && (
                    <Badge variant="default" className="text-xs">
                      Override: {semanticOverride.difficulty.difficultyBand.replace(/_/g, ' ')}
                      {typeof semanticOverride.difficulty.difficultyScore === 'number'
                        ? ` (${Math.round(semanticOverride.difficulty.difficultyScore * 100)}/100)`
                        : ''}
                    </Badge>
                  )}
                  {question.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                  {semanticAnalysis?.tags?.map((t) => (
                    <Badge key={t.tagId} variant="secondary" className="text-xs">{t.tagName}</Badge>
                  ))}
                  {semanticOverride?.tags?.applied?.map((t) => (
                    <Badge key={`override-${t.tagId}`} variant="default" className="text-xs">Override: {t.tagName}</Badge>
                  ))}
                </div>

                {semanticAnalysis ? (
                  <div className="pt-4">
                    <Accordion type="single" collapsible>
                      <AccordionItem value="why">
                        <AccordionTrigger className="text-sm">Why this was determined</AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            <div className="text-xs text-muted-foreground">
                              Model: <span className="font-mono text-foreground">{semanticAnalysis.modelId}</span>
                            </div>

                            {semanticAnalysis.tags?.length ? (
                              <div>
                                <div className="text-xs font-semibold mb-2">Top semantic matches</div>
                                <div className="space-y-1">
                                  {semanticAnalysis.tags.slice(0, 6).map((t) => (
                                    <div key={t.tagId} className="flex items-center justify-between gap-3 text-xs">
                                      <div className="text-foreground">{t.tagName}</div>
                                      <div className="font-mono text-muted-foreground">{(t.score * 100).toFixed(0)}%</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            <div>
                              <div className="text-xs font-semibold mb-2">Difficulty factors</div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="text-muted-foreground">Semantic complexity</div>
                                <div className="font-mono text-foreground">{Math.round((semanticAnalysis.difficultyFactors.semanticComplexity || 0) * 100)}/100</div>
                                <div className="text-muted-foreground">Conceptual depth</div>
                                <div className="font-mono text-foreground">{Math.round((semanticAnalysis.difficultyFactors.conceptualDepth || 0) * 100)}/100</div>
                                <div className="text-muted-foreground">Reasoning steps</div>
                                <div className="font-mono text-foreground">{Math.round((semanticAnalysis.difficultyFactors.reasoningSteps || 0) * 100)}/100</div>
                                <div className="text-muted-foreground">Abstraction level</div>
                                <div className="font-mono text-foreground">{Math.round((semanticAnalysis.difficultyFactors.abstractionLevel || 0) * 100)}/100</div>
                                <div className="text-muted-foreground">Symbol density</div>
                                <div className="font-mono text-foreground">{Math.round((semanticAnalysis.difficultyFactors.symbolDensity || 0) * 100)}/100</div>
                                <div className="text-muted-foreground">Prerequisite load</div>
                                <div className="font-mono text-foreground">{Math.round((semanticAnalysis.difficultyFactors.prerequisiteLoad || 0) * 100)}/100</div>
                              </div>
                            </div>

                            {semanticAnalysis.rationale?.topSignals?.length ? (
                              <div>
                                <div className="text-xs font-semibold mb-2">Key signals</div>
                                <ul className="list-disc pl-4 space-y-1 text-xs text-foreground">
                                  {semanticAnalysis.rationale.topSignals.slice(0, 5).map((s, idx) => (
                                    <li key={`${s.label}-${idx}`}>
                                      <span className="font-semibold">{s.label}</span>
                                      {s.detail ? ` — ${s.detail}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {semanticAnalysis.rationale?.difficultyComponents ? (
                              <div>
                                <div className="text-xs font-semibold mb-2">Difficulty components (normalized)</div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="text-muted-foreground">Foundational distance</div>
                                  <div className="font-mono text-foreground">{semanticAnalysis.rationale.difficultyComponents.foundationalDistance.toFixed(6)}</div>
                                  <div className="text-muted-foreground">Abstraction depth</div>
                                  <div className="font-mono text-foreground">{semanticAnalysis.rationale.difficultyComponents.abstractionDepth.toFixed(6)}</div>
                                  <div className="text-muted-foreground">Reasoning chain</div>
                                  <div className="font-mono text-foreground">{semanticAnalysis.rationale.difficultyComponents.reasoningChain.toFixed(6)}</div>
                                  <div className="text-muted-foreground">Prerequisite breadth</div>
                                  <div className="font-mono text-foreground">{semanticAnalysis.rationale.difficultyComponents.prerequisiteBreadth.toFixed(6)}</div>
                                </div>
                              </div>
                            ) : null}

                            {semanticAnalysis.rationale?.consistency?.length ? (
                              <div>
                                <div className="text-xs font-semibold mb-2">Consistency validation</div>
                                <ul className="list-disc pl-4 space-y-1 text-xs text-foreground">
                                  {semanticAnalysis.rationale.consistency.slice(0, 8).map((r, idx) => (
                                    <li key={`${r.rule}-${idx}`}>
                                      <span className="font-semibold">{r.rule}</span>
                                      <span className="font-mono"> ({r.delta.toFixed(6)})</span>
                                      {r.detail ? ` — ${r.detail}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {semanticAnalysis.rationale?.heuristics?.length ? (
                              <div>
                                <div className="text-xs font-semibold mb-2">Heuristic contributions</div>
                                <div className="space-y-2">
                                  {semanticAnalysis.rationale.heuristics.slice(0, 6).map((h, idx) => (
                                    <div key={`${h.key}-${idx}`} className="rounded-md border bg-muted/20 p-2">
                                      <div className="flex items-center justify-between gap-2 text-xs">
                                        <div className="font-mono text-foreground">{h.key}</div>
                                        <div className="font-mono text-muted-foreground">{h.score.toFixed(6)}</div>
                                      </div>
                                      {h.contributedTo?.length ? (
                                        <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                                          {h.contributedTo.slice(0, 6).map((c, j) => (
                                            <div key={`${c.tagId}-${j}`} className="flex items-center justify-between gap-2">
                                              <div className="text-muted-foreground truncate">{c.tagId}</div>
                                              <div className="font-mono text-foreground">{c.weight.toFixed(6)}</div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {semanticAnalysis.rationale?.activatedNodes?.length ? (
                              <div>
                                <div className="text-xs font-semibold mb-2">Activated ontology nodes (score breakdown)</div>
                                <div className="space-y-1">
                                  {semanticAnalysis.rationale.activatedNodes.slice(0, 12).map((n, idx) => (
                                    <div key={`${n.tagId}-${idx}`} className="rounded-md border p-2">
                                      <div className="flex items-center justify-between gap-2 text-xs">
                                        <div className="text-foreground font-semibold">{n.tagName}</div>
                                        <div className="font-mono text-foreground">{n.finalScore.toFixed(6)}</div>
                                      </div>
                                      <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                                        <div className="text-muted-foreground">base</div>
                                        <div className="font-mono text-foreground">{n.baseSimilarity.toFixed(6)}</div>
                                        <div className="text-muted-foreground">heuristic</div>
                                        <div className="font-mono text-foreground">{n.heuristicBoost.toFixed(6)}</div>
                                        <div className="text-muted-foreground">up-prop</div>
                                        <div className="font-mono text-foreground">{n.propagatedFromChildren.toFixed(6)}</div>
                                        <div className="text-muted-foreground">down-prop</div>
                                        <div className="font-mono text-foreground">{n.propagatedToChildren.toFixed(6)}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {semanticAnalysis.rationale.hierarchy?.rootsActivated?.length ? (
                                  <div className="mt-3 text-xs">
                                    <div className="font-semibold mb-1">Root activations</div>
                                    <div className="flex flex-wrap gap-2">
                                      {semanticAnalysis.rationale.hierarchy.rootsActivated.map((r) => (
                                        <Badge key={r.tagId} variant="outline" className="text-[10px]">
                                          {r.tagName} {r.score.toFixed(6)}
                                        </Badge>
                                      ))}
                                      {semanticAnalysis.rationale.hierarchy.siblingSuppressionApplied ? (
                                        <Badge variant="secondary" className="text-[10px]">Sibling suppression applied</Badge>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="override">
                        <AccordionTrigger className="text-sm">Override (admin)</AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            <div className="text-xs text-muted-foreground">
                              Overrides are stored locally and never overwrite the AI record.
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-semibold">Override tags (comma-separated)</div>
                              <Input
                                value={overrideTagsText}
                                onChange={(e) => setOverrideTagsText(e.target.value)}
                                placeholder="e.g. Mathematics, Algebra, Linear Equations"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-semibold">Override difficulty score (0 to 1)</div>
                              <Input
                                value={overrideDifficultyText}
                                onChange={(e) => setOverrideDifficultyText(e.target.value)}
                                placeholder="e.g. 0.523456"
                              />
                              <div className="text-[11px] text-muted-foreground">
                                Stored with 6-decimal precision and mapped to a band deterministically.
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={overrideSaving}
                                onClick={async () => {
                                  if (!semanticAnalysis) return;
                                  setOverrideSaving(true);
                                  try {
                                    const now = Date.now();
                                    const rawTags = overrideTagsText
                                      .split(',')
                                      .map((t) => t.trim())
                                      .filter(Boolean);
                                    const appliedTags = rawTags.map((name, idx) => ({
                                      tagId: `user:${name.toLowerCase().replace(/\s+/g, '-')}`,
                                      tagName: name,
                                      score: 1,
                                      rank: idx + 1,
                                      explanation: 'User override',
                                    }));

                                    const parsedScore = overrideDifficultyText.trim() ? Number(overrideDifficultyText) : NaN;
                                    const hasDifficulty = Number.isFinite(parsedScore);
                                    const clamped = hasDifficulty ? Math.max(0, Math.min(1, parsedScore)) : undefined;
                                    const rounded = typeof clamped === 'number' ? Math.round(clamped * 1_000_000) / 1_000_000 : undefined;

                                    const payload = {
                                      id: semanticOverride?.id || uuidv4(),
                                      questionId: question.id,
                                      baseAnalysisId: semanticAnalysis.id,
                                      createdAt: semanticOverride?.createdAt || now,
                                      updatedAt: now,
                                      tags: rawTags.length ? { applied: appliedTags } : undefined,
                                      difficulty: typeof rounded === 'number'
                                        ? {
                                            difficultyScore: rounded,
                                            difficultyBand: mapScoreToBand(rounded),
                                          }
                                        : undefined,
                                    };
                                    await db.questionSemanticOverrides.put(payload as any);
                                    toast.success('Override saved');
                                  } catch (e) {
                                    console.error(e);
                                    toast.error('Failed to save override');
                                  } finally {
                                    setOverrideSaving(false);
                                  }
                                }}
                              >
                                Save Override
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={overrideSaving || !semanticOverride}
                                onClick={async () => {
                                  if (!semanticOverride) return;
                                  setOverrideSaving(true);
                                  try {
                                    await db.questionSemanticOverrides.delete(semanticOverride.id);
                                    toast.success('Override cleared');
                                  } catch (e) {
                                    console.error(e);
                                    toast.error('Failed to clear override');
                                  } finally {
                                    setOverrideSaving(false);
                                  }
                                }}
                              >
                                Clear Override
                              </Button>
                            </div>

                            {effectiveDifficultyBand && (
                              <div className="text-xs text-muted-foreground">
                                Effective difficulty: <span className="font-semibold text-foreground">{effectiveDifficultyBand.replace(/_/g, ' ')}</span>
                                {typeof effectiveDifficultyScore === 'number'
                                  ? <span className="font-mono"> {effectiveDifficultyScore.toFixed(6)}</span>
                                  : null}
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                ) : null}
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

