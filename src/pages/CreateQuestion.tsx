import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Plus, X, Save, Sparkles } from 'lucide-react';
import { db, Question, normalizeGlossaryMeaning, normalizeGlossaryWord } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import RichTextEditor from '@/components/RichTextEditor';
import TypingAnswerMathInput from '@/components/TypingAnswerMathInput';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { invalidateTagModelCache, suggestTagsAdvanced } from '@/lib/tagLearning';
import { syncQuestionGlossary } from '@/lib/glossary';
import { enqueueSemanticAnalysis, startSemanticBackgroundQueue, stopSemanticBackgroundQueue } from '@/lib/semanticQueue';
import {
  analyzeQuestionDraft,
  ANALYSIS_VERSION,
  autoAssignQuestionToModules,
  suggestDifficultySpectrum,
  mapLevelToSelectOptions,
  mapLevelToClassicDifficulty,
  persistDifficultySignal,
  QuestionIntelligenceSnapshot,
  upsertQuestionIntelligenceMetadata,
} from '@/lib/intelligenceEngine';

const QUESTION_TYPES: Question['type'][] = ['mcq', 'text', 'fill_blanks', 'matching'];
const DEFAULT_LEVEL = 6;
const TYPE_LABELS: Record<Question['type'], string> = {
  mcq: 'Multiple Choice',
  text: 'Free Text',
  fill_blanks: 'Fill in the Blanks',
  matching: 'Matching',
};

async function blobToBase64(blob: Blob): Promise<string> {
	return await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error('Failed to read blob'));
		reader.onload = () => {
			const res = reader.result;
			if (typeof res !== 'string') {
				reject(new Error('Unexpected FileReader result'));
				return;
			}
			const commaIdx = res.indexOf(',');
			resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
		};
		reader.readAsDataURL(blob);
	});
}

async function tryFetchAsBlob(url: string): Promise<{ blob: Blob; mimeType: string } | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const blob = await res.blob();
		const mimeType = blob.type || res.headers.get('content-type') || 'application/octet-stream';
		return { blob, mimeType };
	} catch {
		return null;
	}
}

type ImportedOcrQuestion = {
	pageIndex: number;
	text: string;
	questionImages: string[];
	options: Record<string, { text: string; images: string[] }>;
};

function flattenOcrQuestions(res: any): ImportedOcrQuestion[] {
	const out: ImportedOcrQuestion[] = [];
	const pages = Array.isArray(res?.pages) ? res.pages : [];
	for (const p of pages) {
		const pageIndex = Number.isFinite(p?.pageIndex) ? p.pageIndex : 0;
		const qs = Array.isArray(p?.questions) ? p.questions : [];
		for (const q of qs) {
			out.push({
				pageIndex,
				text: String(q?.text || ''),
				questionImages: Array.isArray(q?.questionImages) ? q.questionImages.filter(Boolean) : [],
				options: q?.options && typeof q.options === 'object' ? q.options : {},
			});
		}
	}
	return out;
}

function classicDifficultyToLevel(value?: 'easy' | 'medium' | 'hard'): number {
  if (value === 'easy') return 3;
  if (value === 'hard') return 10;
  return DEFAULT_LEVEL;
}

export default function CreateQuestion() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  const [importConfigOpen, setImportConfigOpen] = useState(false);
  const [importRangeText, setImportRangeText] = useState('');
  const [importDpi, setImportDpi] = useState<number>(300);
  const [isImportingPdf, setIsImportingPdf] = useState(false);

	useEffect(() => {
		// The semantic background queue can be CPU-heavy (offline analysis across many questions)
		// and may cause scroll jank while editing. Pause it on this page.
		stopSemanticBackgroundQueue();
		return () => {
			startSemanticBackgroundQueue();
		};
	}, []);

  // Load existing question if editing
  const existingQuestion = useLiveQuery(
    () => (id ? db.questions.get(id) : undefined),
    [id]
  );

  const [initialized, setInitialized] = useState(!isEditing);

  // Form state
  const [questionType, setQuestionType] = useState<'mcq' | 'text' | 'fill_blanks' | 'matching'>('mcq');
  const [questionText, setQuestionText] = useState('');
  const [questionImages, setQuestionImages] = useState<string[]>([]);
  const [options, setOptions] = useState([
    { id: uuidv4(), text: '' },
    { id: uuidv4(), text: '' },
  ]);
  const [correctAnswers, setCorrectAnswers] = useState<string[]>([]);
  const [fillBlanksMeta, setFillBlanksMeta] = useState<{ id: string; correct: string }[]>([]);
  const [matchingHeading, setMatchingHeading] = useState('');
  const [matchingPairs, setMatchingPairs] = useState<{ leftId: string; leftText: string; rightId: string; rightText: string }[]>([]);
  const [explanation, setExplanation] = useState('');
  const [glossaryEntries, setGlossaryEntries] = useState<Array<{ id: string; word: string; meaning: string }>>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [selectTagValue, setSelectTagValue] = useState<string | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [difficultyLevel, setDifficultyLevel] = useState<number>(DEFAULT_LEVEL);
  const [typeDifficulty, setTypeDifficulty] = useState<Record<Question['type'], number>>({
    mcq: DEFAULT_LEVEL,
    text: DEFAULT_LEVEL,
    fill_blanks: DEFAULT_LEVEL,
    matching: DEFAULT_LEVEL,
  });
  const [aiSnapshot, setAiSnapshot] = useState<QuestionIntelligenceSnapshot | null>(null);
  const [isAnalyzingDifficulty, setIsAnalyzingDifficulty] = useState(false);
  const userAdjustedDifficultyRef = useRef(false);
  const [difficultySpectrum, setDifficultySpectrum] = useState<
    { minLevel: number; maxLevel: number; recommendedLevel: number; sampleCount: number; source: 'corpus' | 'heuristic' } | null
  >(null);
	const [importPreviewOpen, setImportPreviewOpen] = useState(false);
	const [importedOcrQuestions, setImportedOcrQuestions] = useState<ImportedOcrQuestion[]>([]);
	const [selectedImportedIndexes, setSelectedImportedIndexes] = useState<Record<number, boolean>>({});
  const settings = useLiveQuery(() => db.settings.get('1'), [], null as any);
  const aiOrchestrator = settings?.aiOrchestrator;
  const levelOptions = useMemo(() => mapLevelToSelectOptions(), []);
  const difficultyBand = useMemo(() => {
    const match = levelOptions.find((entry) => entry.level === difficultyLevel);
    return match ? match.label : `Level ${difficultyLevel}`;
  }, [difficultyLevel, levelOptions]);

  useEffect(() => {
    setDifficulty(mapLevelToClassicDifficulty(difficultyLevel));
  }, [difficultyLevel]);

  useEffect(() => {
    setDifficultyLevel((prev) => typeDifficulty[questionType] ?? prev);
  }, [questionType, typeDifficulty]);

  const allTags = useLiveQuery(() => db.tags.toArray());
  const globalGlossaryEntries = useLiveQuery(() => db.globalGlossary.toArray(), [], []);
  const globalGlossaryMap = useMemo(() => {
    const map = new Map<string, { word: string; meanings: string[] }>();
    if (!globalGlossaryEntries) return map;
    for (const entry of globalGlossaryEntries) {
      if (!entry.word || !entry.meaning) continue;
      const normalized = normalizeGlossaryWord(entry.word);
      if (!normalized) continue;
      const bucket = map.get(normalized) || { word: entry.word, meanings: [] };
      bucket.meanings.push(entry.meaning);
      map.set(normalized, bucket);
    }
    return map;
  }, [globalGlossaryEntries]);

  // Auto-add tags based on question text (with debouncing)
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [autoAddedTags, setAutoAddedTags] = useState<string[]>([]);
  const [hasAutoTagged, setHasAutoTagged] = useState(false);

  useEffect(() => {
    // Reset auto-tagging state when question type changes or when editing
    if (isEditing && initialized) {
      setHasAutoTagged(true); // Don't auto-tag when editing existing question
      return;
    }
    
    if (!questionText.trim() || !allTags || allTags.length === 0 || hasAutoTagged) {
      return;
    }

    // Debounce auto-tagging
    const timeoutId = setTimeout(async () => {
      setIsLoadingTags(true);
      try {
        const suggestions = await suggestTagsAdvanced(questionText, questionType, allTags, 5, {
          selectedTags,
        });
        
        // Automatically add tags that aren't already selected
        const newTags = suggestions.filter(tag => !selectedTags.includes(tag));
        if (newTags.length > 0) {
          setSelectedTags(prev => [...prev, ...newTags]);
          setAutoAddedTags(prev => [...prev, ...newTags]);
          setHasAutoTagged(true);
        }
      } catch (error) {
        console.error('Error auto-tagging:', error);
      } finally {
        setIsLoadingTags(false);
      }
    }, 1000); // Wait 1 second after user stops typing

    return () => clearTimeout(timeoutId);
  }, [questionText, questionType, allTags, selectedTags, isEditing, initialized, hasAutoTagged]);

  useEffect(() => {
    if (!aiOrchestrator?.autoDifficulty) {
      setAiSnapshot(null);
      return;
    }
    const trimmedText = questionText.trim();
    const trimmedExplanation = explanation.trim();
    if (!trimmedText && !trimmedExplanation) {
      setAiSnapshot(null);
      return;
    }
    const handle = setTimeout(() => {
      setIsAnalyzingDifficulty(true);
      try {
        const snapshot = analyzeQuestionDraft({
          id,
          text: questionText,
          explanation,
          type: questionType,
          options: questionType === 'mcq' ? options : undefined,
          tags: selectedTags,
          fillBlanksCount: questionType === 'fill_blanks' ? fillBlanksMeta.length : undefined,
          matchingPairs: questionType === 'matching' ? matchingPairs.length : undefined,
        });
        setAiSnapshot(snapshot);
        if (!userAdjustedDifficultyRef.current) {
          setTypeDifficulty(snapshot.perTypeLevels);
          setDifficultyLevel(snapshot.perTypeLevels[questionType] ?? snapshot.level);
        }
      } finally {
        setIsAnalyzingDifficulty(false);
      }
    }, 700);

    return () => clearTimeout(handle);
  }, [
    aiOrchestrator?.autoDifficulty,
    explanation,
    fillBlanksMeta.length,
    id,
    matchingPairs.length,
    options,
    questionText,
    questionType,
    selectedTags,
  ]);

  useEffect(() => {
    let active = true;
    const handle = setTimeout(() => {
      const draftLevel = aiSnapshot?.perTypeLevels?.[questionType] ?? aiSnapshot?.level ?? difficultyLevel;
      void (async () => {
        try {
          const suggestion = await suggestDifficultySpectrum({
            type: questionType,
            draftLevel,
            selectedTags,
          });
          if (!active) return;
          setDifficultySpectrum({
            minLevel: suggestion.minLevel,
            maxLevel: suggestion.maxLevel,
            recommendedLevel: suggestion.recommendedLevel,
            sampleCount: suggestion.sampleCount,
            source: suggestion.source,
          });

          if (!userAdjustedDifficultyRef.current) {
            setTypeDifficulty((prev) => ({
              ...prev,
              [questionType]: suggestion.recommendedLevel,
            }));
            setDifficultyLevel(suggestion.recommendedLevel);
          }
        } catch {
          if (!active) return;
          setDifficultySpectrum(null);
        }
      })();
    }, 450);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [aiSnapshot, difficultyLevel, questionType, selectedTags]);

  // When editing, wait for existingQuestion to load and then hydrate form once
  useEffect(() => {
    if (!isEditing) return;
    if (!existingQuestion) return;
    if (initialized) return;

    setQuestionType(existingQuestion.type);
    setQuestionText(existingQuestion.text || '');
    setQuestionImages((existingQuestion as any).questionImages || []);
    setOptions(
      existingQuestion.type === 'mcq'
        ? existingQuestion.options || [
            { id: uuidv4(), text: '' },
            { id: uuidv4(), text: '' },
          ]
        : [
            { id: uuidv4(), text: '' },
            { id: uuidv4(), text: '' },
          ]
    );
    setCorrectAnswers(existingQuestion.correctAnswers || []);
    setFillBlanksMeta(existingQuestion.fillBlanks?.blanks || []);
    setMatchingHeading(existingQuestion.matching?.headingHtml || '');
    setMatchingPairs(existingQuestion.matching?.pairs || []);
    setExplanation(existingQuestion.explanation || '');
    setGlossaryEntries(existingQuestion.glossary || []);
    setSelectedTags(existingQuestion.tags || []);
    const restoredLevel =
      existingQuestion.metadata?.difficultyLevel ??
      classicDifficultyToLevel(existingQuestion.metadata?.difficulty);
    setDifficulty(existingQuestion.metadata?.difficulty || 'medium');
    setDifficultyLevel(restoredLevel);
    setTypeDifficulty({
      mcq: existingQuestion.metadata?.typeDifficulty?.mcq ?? restoredLevel,
      text: existingQuestion.metadata?.typeDifficulty?.text ?? restoredLevel,
      fill_blanks: existingQuestion.metadata?.typeDifficulty?.fill_blanks ?? restoredLevel,
      matching: existingQuestion.metadata?.typeDifficulty?.matching ?? restoredLevel,
    });
    userAdjustedDifficultyRef.current = true;
    setAutoAddedTags([]); // Reset auto-added tags when editing
    setHasAutoTagged(true); // Mark as already tagged to prevent auto-tagging
    setInitialized(true);
  }, [existingQuestion, initialized, isEditing]);

  if (isEditing && !initialized) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-muted-foreground">
        Loading question...
      </div>
    );
  }

  const handleAddOption = () => {
    setOptions((prev) => [...prev, { id: uuidv4(), text: '' }]);
  };

  const handleRemoveOption = (id: string) => {
    if (options.length <= 2) {
      toast.error('A question must have at least 2 options');
      return;
    }
    setOptions((prev) => prev.filter((opt) => opt.id !== id));
    setCorrectAnswers((prev) => prev.filter((ans) => ans !== id));
  };

  const handleOptionChange = (id: string, text: string) => {
    setOptions((prev) => prev.map((opt) => (opt.id === id ? { ...opt, text } : opt)));
  };

  const handleCorrectAnswerToggle = (optionId: string) => {
    setCorrectAnswers((prev) => (prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !selectedTags.includes(newTag.trim())) {
      setSelectedTags([...selectedTags, newTag.trim()]);
      setNewTag('');
      
      // Add to tags database if it doesn't exist
      const tagExists = allTags?.some(t => t.name === newTag.trim());
      if (!tagExists) {
        db.tags.add({
          id: uuidv4(),
          name: newTag.trim(),
          createdAt: Date.now(),
        });
      }
    }
  };

  const handleAddGlossaryEntry = () => {
    setGlossaryEntries(prev => [...prev, { id: uuidv4(), word: '', meaning: '' }]);
  };

  const handleGlossaryChange = (id: string, field: 'word' | 'meaning', value: string) => {
    setGlossaryEntries(prev =>
      prev.map(entry => (entry.id === id ? { ...entry, [field]: value } : entry))
    );
  };

  const handleDifficultyLevelChange = (value: number) => {
    userAdjustedDifficultyRef.current = true;
    setDifficultyLevel(value);
    setTypeDifficulty((prev) => ({
      ...prev,
      [questionType]: value,
    }));
  };

  const handleTypeDifficultyChange = (type: Question['type'], value: number) => {
    const clamped = Math.max(1, Math.min(12, value));
    userAdjustedDifficultyRef.current = true;
    setTypeDifficulty((prev) => ({
      ...prev,
      [type]: clamped,
    }));
    if (type === questionType) {
      setDifficultyLevel(clamped);
    }
  };

  const handleApplyAiSuggestion = () => {
    if (!aiSnapshot) return;
    userAdjustedDifficultyRef.current = false;
    setTypeDifficulty(aiSnapshot.perTypeLevels);
    setDifficultyLevel(aiSnapshot.perTypeLevels[questionType] ?? aiSnapshot.level);
  };

  const handleRemoveGlossaryEntry = (id: string) => {
    setGlossaryEntries(prev => prev.filter(entry => entry.id !== id));
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
    setAutoAddedTags(autoAddedTags.filter(t => t !== tag));
  };


  const handleAddTagFromPool = (tagName: string) => {
    if (!selectedTags.includes(tagName)) {
      setSelectedTags([...selectedTags, tagName]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const userAdjustedDifficulty = userAdjustedDifficultyRef.current;
    // Validation
    if (!questionText.trim()) {
      toast.error('Question text is required');
      return;
    }

    let nextFillBlanksMeta = fillBlanksMeta;

    if (questionType === 'mcq') {
      if (options.some(opt => !opt.text.trim())) {
        toast.error('All options must have text');
        return;
      }
      if (correctAnswers.length === 0) {
        toast.error('At least one correct answer must be selected');
        return;
      }
    } else if (questionType === 'text') {
      if (correctAnswers.length === 0 || correctAnswers.some(ans => !ans.trim())) {
        toast.error('At least one acceptable answer is required');
        return;
      }
    } else if (questionType === 'fill_blanks') {
      // Re-scan the HTML for blanks to ensure metadata is up to date
      const parser = new DOMParser();
      const doc = parser.parseFromString(questionText || '', 'text/html');
      const spans = Array.from(doc.querySelectorAll('[data-blank="true"]')) as HTMLElement[];
      if (!spans.length) {
        toast.error('Add at least one blank to the passage');
        return;
      }
      const blanks: { id: string; correct: string }[] = spans.map((el, index) => {
        let id = el.getAttribute('data-blank-id') || '';
        if (!id) {
          id = `b${index + 1}`;
          el.setAttribute('data-blank-id', id);
        }
        const correct = (el.innerText || '').trim();
        return { id, correct };
      }).filter(b => b.correct.length > 0);
      if (!blanks.length) {
        toast.error('Blanks must have non-empty correct answers');
        return;
      }
      nextFillBlanksMeta = blanks;
    } else if (questionType === 'matching') {
      if (!matchingPairs.length) {
        toast.error('Add at least one matching pair');
        return;
      }
      if (matchingPairs.some(p => !p.leftText.trim() || !p.rightText.trim())) {
        toast.error('All matching pairs must have both left and right text');
        return;
      }
    }

    const now = Date.now();
    const questionId = isEditing ? id! : uuidv4();
    const questionCode = existingQuestion?.code || `Q-${questionId.slice(0, 8)}`;
    const metadataPayload = {
      ...existingQuestion?.metadata,
      difficulty,
      difficultyLevel,
      difficultyBand,
      typeDifficulty,
      aiInsightsVersion: aiSnapshot ? ANALYSIS_VERSION : existingQuestion?.metadata?.aiInsightsVersion,
      createdAt: existingQuestion?.metadata?.createdAt || now,
      updatedAt: now,
    };
    const sanitizedGlossary = glossaryEntries
      .map(entry => ({
        id: entry.id,
        word: entry.word.trim(),
        meaning: entry.meaning.trim(),
      }))
      .filter(entry => entry.word && entry.meaning);

    const questionData: Question = {
      id: questionId,
      code: questionCode,
      text: questionText.trim(),
      type: questionType,
      questionImages,
      options: questionType === 'mcq' ? options : undefined,
      correctAnswers: questionType === 'mcq' || questionType === 'text' ? correctAnswers : undefined,
      fillBlanks: questionType === 'fill_blanks' ? { blanks: nextFillBlanksMeta } : undefined,
      matching: questionType === 'matching' ? { headingHtml: matchingHeading.trim() || undefined, pairs: matchingPairs } : undefined,
      tags: selectedTags,
      modules: existingQuestion?.modules || [],
      explanation: explanation.trim() || undefined,
      glossary: sanitizedGlossary.length ? sanitizedGlossary : undefined,
      metadata: {
        ...metadataPayload,
      },
    };

    try {
      if (isEditing) {
        await db.questions.update(id!, {
          text: questionData.text,
          type: questionData.type,
          questionImages: (questionData as any).questionImages,
          options: questionData.options,
          correctAnswers: questionData.correctAnswers,
          fillBlanks: questionData.fillBlanks,
          matching: questionData.matching,
          tags: questionData.tags,
          explanation: questionData.explanation,
          glossary: questionData.glossary,
          metadata: {
            ...(existingQuestion?.metadata || {}),
            ...metadataPayload,
          },
        });
        toast.success('Question updated successfully');
      } else {
        await db.questions.add(questionData);
        toast.success('Question created successfully');
      }
      if (aiSnapshot) {
        await persistDifficultySignal({
          questionId,
          snapshot: aiSnapshot,
          source: userAdjustedDifficulty ? 'override' : 'auto',
          questionType,
          previousLevel: existingQuestion?.metadata?.difficultyLevel,
          nextLevel: difficultyLevel,
        });
      }
      if (aiOrchestrator?.autoModuleAssignment?.enabled) {
        const result = await autoAssignQuestionToModules(questionId);
        if (result.assigned.length) {
          toast.success(`Auto-added to ${result.assigned.length} module${result.assigned.length > 1 ? 's' : ''}.`);
        }
      }
      await syncQuestionGlossary(questionId, questionData.glossary || []);
      invalidateTagModelCache();
      enqueueSemanticAnalysis(questionId);
      navigate('/questions', { state: { scrollToQuestionId: questionId } });
    } catch (error) {
      toast.error('Failed to save question');
      console.error(error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/questions')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {isEditing ? 'Edit Question' : 'Create Question'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditing ? 'Update question details' : 'Add a new question to your bank'}
          </p>
        </div>
			<div className="ml-auto">
				<Button
					type="button"
					variant="outline"
					onClick={() => {
						if (!window.ocr?.importExamPdf) {
							toast.error('PDF import is only available in the desktop (Electron) app.');
							return;
						}
						setImportConfigOpen(true);
					}}
				>
					Import PDF
				</Button>
			</div>
      </div>

			<Dialog open={importConfigOpen} onOpenChange={setImportConfigOpen}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Import PDF</DialogTitle>
						<DialogDescription>
							Choose a page range (optional) and import resolution. After you click Import, a file picker will open to select the PDF.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="space-y-1">
							<Label>Page range (optional)</Label>
							<Input
								value={importRangeText}
								onChange={(e) => setImportRangeText(e.target.value)}
								placeholder="Examples: 1 or 1-3 (leave blank for all pages)"
							/>
						</div>
						<div className="space-y-1">
							<Label>DPI</Label>
							<Input
								type="number"
								value={String(importDpi)}
								onChange={(e) => {
									const n = Number(e.target.value);
									setImportDpi(Number.isFinite(n) ? n : 300);
								}}
								min={150}
								max={600}
							/>
							<div className="text-xs text-muted-foreground">Higher DPI can improve OCR but will be slower.</div>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setImportConfigOpen(false)} disabled={isImportingPdf}>
							Cancel
						</Button>
						<Button
							type="button"
							disabled={isImportingPdf}
							onClick={async () => {
							try {
								if (!window.ocr?.importExamPdf) {
									toast.error('PDF import is only available in the desktop (Electron) app.');
									return;
								}
								let pageStart: number | undefined;
								let pageEnd: number | undefined;
								const raw = importRangeText.trim();
								if (raw.length) {
									const m = raw.match(/^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/);
									if (!m) {
										toast.error('Invalid page range. Use 1 or 1-3');
										return;
									}
									pageStart = Number(m[1]);
									pageEnd = m[2] ? Number(m[2]) : Number(m[1]);
								}
								setIsImportingPdf(true);
								const res = await window.ocr.importExamPdf({
									dpi: importDpi,
									pageStart,
									pageEnd,
								});
								const flattened = flattenOcrQuestions(res);
								if (!flattened.length) {
									toast.error('No questions detected');
									return;
								}
								setImportedOcrQuestions(flattened);
								setSelectedImportedIndexes(
									Object.fromEntries(flattened.map((_, idx) => [idx, true])) as Record<number, boolean>
								);
								setImportConfigOpen(false);
								setImportPreviewOpen(true);
							} catch (e) {
								toast.error('Import failed');
								console.error(e);
							} finally {
								setIsImportingPdf(false);
							}
						}}
						>
							{isImportingPdf ? 'Importing…' : 'Choose PDF & Import'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={importPreviewOpen} onOpenChange={setImportPreviewOpen}>
				<DialogContent className="max-w-4xl">
					<DialogHeader>
						<DialogTitle>Import Questions from PDF</DialogTitle>
						<DialogDescription>Select which extracted questions to insert into your question bank.</DialogDescription>
					</DialogHeader>
					<div className="max-h-[70vh] overflow-auto space-y-4 pr-2">
						{importedOcrQuestions.map((q, idx) => {
							const checked = !!selectedImportedIndexes[idx];
							const optionKeys = Object.keys(q.options || {});
							return (
								<Card key={`${q.pageIndex}-${idx}`} className="p-4 space-y-3">
									<div className="flex items-start gap-3">
										<Checkbox
											checked={checked}
											onCheckedChange={(v) => {
												setSelectedImportedIndexes((prev) => ({ ...prev, [idx]: !!v }));
											}}
										/>
										<div className="flex-1">
											<div className="text-sm text-muted-foreground">Page {q.pageIndex + 1} • Extracted #{idx + 1}</div>
											<div className="mt-2 whitespace-pre-wrap text-sm">{q.text?.slice(0, 800) || ''}</div>
											{Array.isArray(q.questionImages) && q.questionImages.length > 0 ? (
												<div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
													{q.questionImages.map((src, i2) => (
														<img key={`${src}-${i2}`} src={src} className="max-w-full rounded-md border" loading="lazy" />
													))}
											</div>
										) : null}
										{optionKeys.length ? (
											<div className="mt-3 space-y-2">
												<div className="text-sm font-medium">Options</div>
												{optionKeys.map((k) => (
													<div key={k} className="text-sm">
														<div className="font-medium">{k}</div>
														<div className="whitespace-pre-wrap">{q.options[k]?.text || ''}</div>
														{Array.isArray(q.options[k]?.images) && q.options[k].images.length > 0 ? (
															<div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
																{q.options[k].images.map((src, oi) => (
																	<img key={`${src}-${oi}`} src={src} className="max-w-full rounded-md border" loading="lazy" />
																))}
															</div>
														) : null}
													</div>
												))}
											</div>
										) : null}
									</div>
								</div>
							</Card>
							);
						})}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setSelectedImportedIndexes(Object.fromEntries(importedOcrQuestions.map((_, idx) => [idx, false])) as any);
							}}
						>
							Select None
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								setSelectedImportedIndexes(Object.fromEntries(importedOcrQuestions.map((_, idx) => [idx, true])) as any);
							}}
						>
							Select All
						</Button>
						<Button
							onClick={async () => {
							try {
								const now = Date.now();
								const chosen = importedOcrQuestions
									.map((q, idx) => ({ q, idx }))
									.filter(({ idx }) => !!selectedImportedIndexes[idx])
									.map(({ q }) => q);
								if (!chosen.length) {
									toast.error('Select at least one question');
									return;
								}

								const toInsert: Question[] = chosen.map((q) => {
									const qid = uuidv4();
									const optionKeys = Object.keys(q.options || {});
									const opts = optionKeys.map((k) => ({
										id: uuidv4(),
										text: String(q.options[k]?.text || ''),
										images: Array.isArray(q.options[k]?.images) ? q.options[k].images.filter(Boolean) : [],
									}));
									return {
										id: qid,
										code: `Q-${qid.slice(0, 8)}`,
										text: String(q.text || '').trim(),
										type: 'mcq',
										questionImages: Array.isArray(q.questionImages) ? q.questionImages.filter(Boolean) : [],
										options: opts,
										correctAnswers: [],
										tags: [],
										modules: [],
										metadata: { createdAt: now, updatedAt: now },
									};
								});

								await db.questions.bulkAdd(toInsert);
								toast.success(`Inserted ${toInsert.length} question${toInsert.length > 1 ? 's' : ''}`);
								setImportPreviewOpen(false);
							} catch (e) {
								toast.error('Failed to insert questions');
								console.error(e);
							}
						}}
						>
							Insert Selected
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

      {/* Form */}
      <div className="pr-2">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Question Type */}
          <Card className="p-6">
            <Label className="text-base font-semibold">Question Type</Label>
            <RadioGroup
              value={questionType}
              onValueChange={(value: 'mcq' | 'text' | 'fill_blanks' | 'matching') => {
                setQuestionType(value);
                setCorrectAnswers([]);
              }}
              className="mt-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="mcq" id="mcq" />
                <Label htmlFor="mcq" className="cursor-pointer">Multiple Choice</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="text" id="text" />
                <Label htmlFor="text" className="cursor-pointer">Free Text Answer</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fill_blanks" id="fill_blanks" />
                <Label htmlFor="fill_blanks" className="cursor-pointer">Fill in the Blanks</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="matching" id="matching" />
                <Label htmlFor="matching" className="cursor-pointer">Matching</Label>
              </div>
            </RadioGroup>
          </Card>

          {/* Question Text */}
          <Card className="p-6">
            <Label htmlFor="question" className="text-base font-semibold">Question Text *</Label>
            <div className="mt-4 w-full">
              <RichTextEditor
                value={questionText}
                onChange={setQuestionText}
                placeholder="Enter your question here..."
                enableBlanksButton={questionType === 'fill_blanks'}
                className="tk-question-editor"
              />
            </div>
				{questionImages.length > 0 && (
					<div className="mt-4 space-y-3">
						{questionImages.map((src, idx) => (
							<div key={`${src}-${idx}`} className="space-y-2">
								<img src={src} alt={`question-figure-${idx + 1}`} className="max-w-full rounded-md border" loading="lazy" />
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setQuestionImages((prev) => prev.filter((_, i) => i !== idx))}
								>
									Remove image
								</Button>
							</div>
						))}
					</div>
				)}
          </Card>

        {/* Matching settings */}
        {questionType === 'matching' && (
          <Card className="p-6 space-y-5">
            <Label className="text-base font-semibold">Matching Heading (Optional)</Label>
            <RichTextEditor
              value={matchingHeading}
              onChange={setMatchingHeading}
              placeholder="Enter optional heading or instructions for this matching question..."
              enableBlanksButton={false}
            />
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Pairs</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMatchingPairs([
                      ...matchingPairs,
                      {
                        leftId: uuidv4(),
                        leftText: '',
                        rightId: uuidv4(),
                        rightText: '',
                      },
                    ]);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Pair
                </Button>
              </div>
              <div className="space-y-4">
                {matchingPairs.map((pair, idx) => (
                  <div key={pair.leftId} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Left {idx + 1}</Label>
                      <Textarea
                        value={pair.leftText}
                        onChange={(e) => {
                          const next = matchingPairs.map(p => p.leftId === pair.leftId ? { ...p, leftText: e.target.value } : p);
                          setMatchingPairs(next);
                        }}
                        placeholder="Left item text"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Right {idx + 1}</Label>
                      <div className="flex gap-2">
                        <Textarea
                          value={pair.rightText}
                          onChange={(e) => {
                            const next = matchingPairs.map(p => p.leftId === pair.leftId ? { ...p, rightText: e.target.value } : p);
                            setMatchingPairs(next);
                          }}
                          placeholder="Right item text"
                          rows={2}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setMatchingPairs(matchingPairs.filter(p => p.leftId !== pair.leftId));
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Each row defines a matching pair. Left items will appear fixed, and right items will be draggable/selectable in the module runner.
              </p>
            </div>
          </Card>
        )}

        {/* Options (MCQ) */}
        {questionType === 'mcq' && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Answer Options *</Label>
              <Button type="button" onClick={handleAddOption} size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Option
              </Button>
            </div>

            <div className="space-y-10">
              {options.map((option, index) => (
                <div key={option.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={correctAnswers.includes(option.id)}
                      onCheckedChange={() => handleCorrectAnswerToggle(option.id)}
                    />
                    <Label className="text-sm text-muted-foreground">Correct</Label>
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveOption(option.id)}
                        className="ml-auto"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <RichTextEditor
                    value={option.text}
                    onChange={(html) => handleOptionChange(option.id, html)}
                    placeholder={`Option ${index + 1}`}
                    enableBlanksButton={false}
                    className="tk-option-editor"
                  />
						{Array.isArray((option as any).images) && (option as any).images.length > 0 && (
							<div className="space-y-2">
								{(option as any).images.map((src: string, idx: number) => (
									<div key={`${src}-${idx}`} className="space-y-2">
										<img src={src} alt={`option-figure-${idx + 1}`} className="max-w-full rounded-md border" loading="lazy" />
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() =>
												setOptions((prev) =>
													prev.map((o) =>
														o.id === option.id
															? { ...(o as any), images: (o as any).images.filter((_: any, i: number) => i !== idx) }
															: o
													)
												)
											}
										>
											Remove image
										</Button>
									</div>
								))}
							</div>
						)}
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Check the box(es) next to correct answer(s)
            </p>
          </Card>
        )}

        {/* Correct Answers (Text) */}
        {questionType === 'text' && (
          <Card className="p-6 space-y-5">
            <Label className="text-base font-semibold">Acceptable Answers *</Label>
            <div className="space-y-3">
              {correctAnswers.map((answer, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-full max-w-xl">
                    <TypingAnswerMathInput
                      value={answer}
                      onChange={(v) => {
                        const newAnswers = [...correctAnswers];
                        newAnswers[index] = v;
                        setCorrectAnswers(newAnswers);
                      }}
                      placeholder={`Acceptable answer ${index + 1}`}
                      className="rounded-md"
                    />
                  </div>
                  {correctAnswers.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setCorrectAnswers(correctAnswers.filter((_, i) => i !== index))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCorrectAnswers([...correctAnswers, ''])}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Alternative Answer
            </Button>
            <p className="text-sm text-muted-foreground">
              Add multiple acceptable answers if there are different valid responses
            </p>
          </Card>
        )}

        {/* Explanation */}
        <Card className="p-6">
          <Label htmlFor="explanation" className="text-base font-semibold">
            Explanation (Optional)
          </Label>
          <div className="mt-4 w-full">
            <RichTextEditor
              value={explanation}
              onChange={setExplanation}
              placeholder="Provide an explanation or feedback for this question..."
              enableBlanksButton={false}
              className="tk-explanation-editor"
            />
          </div>
        </Card>

        {/* Glossary */}
        <Card className="p-6 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <Label className="text-base font-semibold">Glossary (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Add key words and their meanings. Learners can double-click a word while viewing the question to see its definition.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={handleAddGlossaryEntry}>
              <Plus className="h-4 w-4 mr-2" />
              Add Word
            </Button>
          </div>

          {glossaryEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-md p-4 text-center">
              No glossary entries yet. Click &ldquo;Add Word&rdquo; to include contextual meanings.
            </p>
          ) : (
            <div className="space-y-4">
              {glossaryEntries.map((entry) => {
                const normalizedWord = normalizeGlossaryWord(entry.word);
                const existingWordData = normalizedWord ? globalGlossaryMap.get(normalizedWord) : undefined;
                const existingMeanings = existingWordData?.meanings || [];
                const normalizedMeaning = normalizeGlossaryMeaning(entry.meaning);
                const duplicateMeaning =
                  normalizedMeaning &&
                  existingMeanings.some(
                    (meaning) => normalizeGlossaryMeaning(meaning) === normalizedMeaning
                  );

                return (
                  <div key={entry.id} className="rounded-lg border p-4 space-y-3 bg-muted/10">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start">
                      <div className="flex-1 space-y-2">
                        <div>
                          <Label className="text-xs font-semibold uppercase text-muted-foreground">Word or phrase</Label>
                          <Input
                            value={entry.word}
                            onChange={(e) => handleGlossaryChange(entry.id, 'word', e.target.value)}
                            placeholder="e.g., Photosynthesis"
                          />
                        </div>
                        {existingWordData && existingWordData.meanings.length > 0 && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Sparkles className="h-3 w-3 text-primary" />
                            <span>
                              Already defined in {existingWordData.meanings.length} other place{existingWordData.meanings.length > 1 ? 's' : ''}.
                            </span>
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="self-start text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveGlossaryEntry(entry.id)}
                        aria-label="Remove glossary entry"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs font-semibold uppercase text-muted-foreground">Meaning</Label>
                        <Textarea
                          value={entry.meaning}
                          onChange={(e) => handleGlossaryChange(entry.id, 'meaning', e.target.value)}
                          placeholder="Provide a concise explanation or translation..."
                          rows={3}
                        />
                      </div>
                      {existingWordData && existingWordData.meanings.length > 0 && (
                        <div className="rounded-md border border-dashed p-3 bg-background/70 text-xs text-muted-foreground space-y-1">
                          <div className="font-semibold text-foreground text-sm">
                            Existing meaning{existingWordData.meanings.length > 1 ? 's' : ''} for &ldquo;{existingWordData.word}&rdquo;
                          </div>
                          <ul className="list-disc pl-4 space-y-1">
                            {existingWordData.meanings.map((meaning, idx) => {
                              const isDuplicate = normalizeGlossaryMeaning(meaning) === normalizedMeaning;
                              return (
                                <li
                                  key={`${meaning}-${idx}`}
                                  className={isDuplicate ? 'text-destructive font-semibold' : undefined}
                                >
                                  {meaning}
                                  {isDuplicate && ' (duplicate)'}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {duplicateMeaning && (
                        <p className="text-xs text-destructive">
                          This meaning already exists for the selected word. Consider keeping a single version to avoid duplicates.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Difficulty & Tags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-base font-semibold">Difficulty Spectrum</Label>
                <p className="text-sm text-muted-foreground">
                  12-level scale tuned per question type
                </p>
              </div>
              <Badge variant="secondary" className="text-xs whitespace-nowrap">
                {difficultyBand}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Level 1</span>
              <input
                type="range"
                min={difficultySpectrum?.minLevel ?? 1}
                max={difficultySpectrum?.maxLevel ?? 12}
                value={difficultyLevel}
                onChange={(e) => handleDifficultyLevelChange(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-muted-foreground">Level 12</span>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                {TYPE_LABELS[questionType]}
                <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                  Active
                </Badge>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={difficultySpectrum?.minLevel ?? 1}
                  max={difficultySpectrum?.maxLevel ?? 12}
                  value={typeDifficulty[questionType]}
                  onChange={(e) =>
                    handleTypeDifficultyChange(questionType, Number(e.target.value || '0'))
                  }
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">Level</span>
                {difficultySpectrum && (
                  <span className="text-[11px] text-muted-foreground">
                    Suggested: {difficultySpectrum.recommendedLevel} ({difficultySpectrum.source})
                  </span>
                )}
              </div>
            </div>
            {aiOrchestrator?.autoDifficulty && (
              <div className="rounded-md border border-dashed p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-semibold">AI Insight</p>
                      <p className="text-xs text-muted-foreground">
                        {isAnalyzingDifficulty
                          ? 'Analyzing question context...'
                          : aiSnapshot
                            ? `Level ${aiSnapshot.level} · ${aiSnapshot.summary}`
                            : 'Start typing to generate an insight'}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleApplyAiSuggestion}
                    disabled={!aiSnapshot}
                  >
                    Use Suggestion
                  </Button>
                </div>
                {aiSnapshot?.concepts?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {aiSnapshot.concepts.map((concept) => (
                      <Badge key={concept} variant="secondary" className="text-[10px] uppercase">
                        {concept}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {aiSnapshot && aiSnapshot.mathDensity > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Math density: {(aiSnapshot.mathDensity * 100).toFixed(0)}%
                  </p>
                ) : null}
              </div>
            )}
          </Card>

          <Card className="p-6 space-y-4">
            <Label className="text-base font-semibold">Tags</Label>
            
            {/* Auto-added tags indicator */}
            {isLoadingTags && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 animate-spin" />
                <span>Analyzing question text and auto-tagging...</span>
              </div>
            )}
            {autoAddedTags.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  <span>Auto-added tags (click X to remove):</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {autoAddedTags
                    .filter(tag => selectedTags.includes(tag))
                    .map(tag => (
                      <Badge
                        key={tag}
                        variant="default"
                        className="gap-2"
                      >
                        {tag}
                        <X
                          className="h-3 w-3 cursor-pointer hover:bg-destructive/20 rounded"
                          onClick={() => handleRemoveTag(tag)}
                        />
                      </Badge>
                    ))}
                </div>
              </div>
            )}

            {/* Manual tag selection from pool */}
            {allTags && allTags.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Select from existing tags ({allTags.length} available):</Label>
                <div className="flex gap-2">
                  <Select
                    value={selectTagValue}
                    onValueChange={(v) => {
                      if (!v) return;
                      handleAddTagFromPool(v);
                      setSelectTagValue(undefined);
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Choose a tag from dropdown..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allTags
                        .filter(tag => !selectedTags.includes(tag.name))
                        .map(tag => (
                          <SelectItem key={tag.id} value={tag.name}>
                            {tag.name}
                          </SelectItem>
                        ))}
                      {allTags.filter(tag => !selectedTags.includes(tag.name)).length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          All tags selected
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-md bg-muted/20">
                  {allTags.map(tag => {
                    const isSelected = selectedTags.includes(tag.name);
                    return (
                      <Badge
                        key={tag.id}
                        variant={isSelected ? 'default' : 'secondary'}
                        className={`gap-2 cursor-pointer transition-all ${
                          isSelected 
                            ? 'ring-2 ring-primary' 
                            : 'hover:ring-1 hover:ring-primary/50'
                        }`}
                        onClick={() => handleAddTagFromPool(tag.name)}
                      >
                        {tag.name}
                        {isSelected && (
                          <X
                            className="h-3 w-3 cursor-pointer hover:bg-destructive/20 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTag(tag.name);
                            }}
                          />
                        )}
                      </Badge>
                    );
                  })}
                </div>
                {selectedTags.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            )}

            {/* Create new tag */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Or create a new tag:</Label>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a new tag..."
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                />
                <Button type="button" onClick={handleAddTag} size="sm">
                  Add
                </Button>
              </div>
            </div>

            {/* Selected tags display */}
            {selectedTags.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Selected tags:</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map(tag => (
                    <Badge key={tag} variant="default" className="gap-2">
                      {tag}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => handleRemoveTag(tag)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/questions')}
          >
            Cancel
          </Button>
          <Button type="submit">
            <Save className="h-4 w-4 mr-2" />
            {isEditing ? 'Update Question' : 'Create Question'}
          </Button>
        </div>
        </form>
      </div>
    </div>
  );
}
