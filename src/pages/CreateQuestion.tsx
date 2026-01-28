import { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { MoveLeft, Plus, X, Save, Sparkles, Upload, Loader2 } from 'lucide-react';
import { db, Question } from '@/lib/db';
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
import MathLiveInput from '@/components/MathLiveInput';
import { invalidateTagModelCache } from '@/lib/tagLearning';
import { recognizeImageText, type OfflineOcrProgress } from '@/lib/offlineOcr';
import { parseScreenshotOcrToDrafts, parseScreenshotOcrToDraftsFromTesseract } from '@/lib/screenshotQuestionParser';
import { ocrTextToRichHtml } from '@/lib/htmlDraft';
import ScreenshotToQuestionModal, { blobToImageData, type ScreenshotToQuestionPastePayload } from '@/components/ScreenshotToQuestionModal';
import {
  autoAssignQuestionToModules,
  mapLevelToSelectOptions,
} from '@/lib/intelligenceEngine';

const QUESTION_TYPES: Question['type'][] = ['mcq', 'text', 'fill_blanks', 'matching', 'long_answer'];
const DEFAULT_LEVEL = 6;
const TYPE_LABELS: Record<Question['type'], string> = {
  mcq: 'Multiple Choice',
  text: 'Free Text',
  fill_blanks: 'Fill in the Blanks',
  matching: 'Matching',
  long_answer: 'Long Answer',
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

function classicDifficultyToLevel(value?: 'easy' | 'medium' | 'hard'): number {
  if (value === 'easy') return 3;
  if (value === 'hard') return 10;
  return DEFAULT_LEVEL;
}

function levelToClassicDifficulty(level: number): 'easy' | 'medium' | 'hard' {
	if (level <= 4) return 'easy';
	if (level >= 9) return 'hard';
	return 'medium';
}

export default function CreateQuestion() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEditing = !!id;

  const wantsScreenshot = useMemo(() => {
    if (!location.search) return false;
    const params = new URLSearchParams(location.search);
    return params.get('screenshot') === '1';
  }, [location.search]);

  useEffect(() => {
    if (!wantsScreenshot) return;
    if (questionType !== 'mcq') {
      setQuestionType('mcq');
      setCorrectAnswers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsScreenshot]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!wantsScreenshot) return;
    const el = document.getElementById('screenshot-question-upload');
    if (el) {
      window.setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
    toast.message('Screenshot → Question', {
      description: 'Upload screenshots below to generate an OCR draft, then paste into this editor.',
    });
  }, [location.search]);

  // Load existing question if editing
  const existingQuestion = useLiveQuery(
    () => (id ? db.questions.get(id) : undefined),
    [id]
  );

  const [initialized, setInitialized] = useState(!isEditing);

  // Form state
  const [questionType, setQuestionType] = useState<'mcq' | 'text' | 'fill_blanks' | 'matching' | 'long_answer'>('mcq');
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
  const [longAnswerIdeal, setLongAnswerIdeal] = useState('');
  const [longAnswerKeywords, setLongAnswerKeywords] = useState('');
  const [longAnswerEnableFeedback, setLongAnswerEnableFeedback] = useState(true);
  const [explanation, setExplanation] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [selectTagValue, setSelectTagValue] = useState<string | undefined>(undefined);
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ tagName: string; score: number }>>([]);
  const [tagSuggestBusy, setTagSuggestBusy] = useState(false);
  const [tagSuggestError, setTagSuggestError] = useState<string>('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [difficultyLevel, setDifficultyLevel] = useState<number>(DEFAULT_LEVEL);
	const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
	const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
	const [ocrBusy, setOcrBusy] = useState(false);
	const [ocrProgress, setOcrProgress] = useState<OfflineOcrProgress | null>(null);
  const settings = useLiveQuery(() => db.settings.get('1'), [], null as any);
  const aiOrchestrator = settings?.aiOrchestrator;
  const levelOptions = useMemo(() => mapLevelToSelectOptions(), []);
	const difficultyBand = useMemo(() => {
		const match = levelOptions.find((entry) => entry.level === difficultyLevel);
		return match ? match.label : `Level ${difficultyLevel}`;
	}, [difficultyLevel, levelOptions]);

	useEffect(() => {
		return () => {
			screenshotPreviews.forEach((u) => URL.revokeObjectURL(u));
		};
	}, [screenshotPreviews]);

	const runInlineOcr = async () => {
		// Kept for compatibility; the embedded tool auto-runs OCR and supports re-run.
		return;
	};

	const onPasteScreenshotFromClipboard = (e: React.ClipboardEvent) => {
		if (!wantsScreenshot) return;
		const items = Array.from(e.clipboardData?.items || []);
		const imgs = items
			.filter((it) => it.type && it.type.startsWith('image/'))
			.map((it) => it.getAsFile())
			.filter((f): f is File => !!f);
		if (!imgs.length) return;
		e.preventDefault();

		setQuestionType('mcq');
		setCorrectAnswers([]);

		setScreenshotFiles((prev) => [...prev, ...imgs]);
		setScreenshotPreviews((prev) => [...prev, ...imgs.map((f) => URL.createObjectURL(f))]);
	};

	const onApplyFromScreenshotTool = (payload: ScreenshotToQuestionPastePayload) => {
		if (questionType !== 'mcq') {
			toast.message('Screenshot → Question works only for MCQ.');
			return;
		}
		setQuestionText(payload.questionHtml || '');
		setQuestionImages(payload.questionImageDataUrls || []);
		if (payload.optionsHtml?.length >= 2) {
			setOptions(payload.optionsHtml.map((o) => ({ id: o.id, text: o.html })));
			setCorrectAnswers(payload.correctOptionIds || []);
		}
	};

  useEffect(() => {
    setDifficulty(levelToClassicDifficulty(difficultyLevel));
  }, [difficultyLevel]);

  const allTags = useLiveQuery(() => db.tags.toArray());

  const suggestTagsFromEmbedding = async () => {
    if (!window.embedding?.suggestTags || !window.embedding?.modelStatus) {
      toast.error('Embedding engine not available in this runtime.');
      return;
    }

    const questionHtml = questionText || '';
    const explanationHtml = explanation || '';
		const optionsHtml = questionType === 'mcq' ? (options || []).map((o) => String((o as any)?.text || '')) : [];
		const matchingHeadingHtml = questionType === 'matching' ? (matchingHeading || '') : '';
		const matchingLeftHtml = questionType === 'matching' ? (matchingPairs || []).map((p) => String((p as any)?.leftText || '')) : [];
		const matchingRightHtml = questionType === 'matching' ? (matchingPairs || []).map((p) => String((p as any)?.rightText || '')) : [];
    const pool = Array.isArray(allTags) ? allTags.map((t) => String(t.name)) : [];
    if (pool.length === 0) {
      toast.error('No tags exist yet. Create a few tags first.');
      return;
    }

    setTagSuggestError('');
    setTagSuggestBusy(true);
    try {
      const status = await window.embedding.modelStatus();
      if (!status?.ready) {
        const msg = String(status?.reason || 'One-time preparation required before offline suggestions can run.');
        setTagSuggestError(msg);
        toast.error(msg);
        setTagSuggestions([]);
        return;
      }

      const res = await window.embedding.suggestTags({
        questionHtml,
        explanationHtml,
			optionsHtml,
			matchingHeadingHtml,
			matchingLeftHtml,
			matchingRightHtml,
        availableTags: pool,
			topK: 3,
			minScore: 0.6,
      });

      if (!res?.ready) {
        const msg = String(res?.reason || 'Embedding engine not ready.');
        setTagSuggestError(msg);
        toast.error(msg);
        setTagSuggestions([]);
        return;
      }

      const suggestions = Array.isArray(res?.suggestions) ? res.suggestions : [];
		const normalized = suggestions
			.filter((s: any) => s && typeof s.tagName === 'string' && Number.isFinite(Number(s.score)))
			.map((s: any) => ({ tagName: String(s.tagName), score: Number(s.score) }))
			.filter((s: any) => s.score >= 0.6)
			.slice(0, 3);
		setTagSuggestions(normalized);

		// Auto-apply top 3 tags above threshold.
		if (normalized.length) {
			setSelectedTags((prev) => {
				const next = [...prev];
				for (const s of normalized) {
					if (!next.includes(s.tagName)) next.push(s.tagName);
				}
				return next;
			});
			for (const s of normalized) {
				void recordTagSuggestionFeedback({ tagName: s.tagName, action: 'accept', score: s.score });
			}
		}
    } catch (e: any) {
      const msg = String(e?.message || 'Failed to suggest tags.');
      setTagSuggestError(msg);
      toast.error(msg);
    } finally {
      setTagSuggestBusy(false);
    }
  };

  const recordTagSuggestionFeedback = async (payload: { tagName: string; action: 'accept' | 'reject' | 'remove' | 'add'; score?: number }) => {
    if (!window.embedding?.recordFeedback) return;
    try {
      await window.embedding.recordFeedback({
        questionId: isEditing ? id : undefined,
        tagName: payload.tagName,
        action: payload.action,
        score: payload.score,
      });
    } catch {
      // ignore
    }
  };

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
    setLongAnswerIdeal((existingQuestion as any).longAnswer?.idealAnswerText || '');
    setLongAnswerKeywords(
      Array.isArray((existingQuestion as any).longAnswer?.keywordChecks)
        ? ((existingQuestion as any).longAnswer.keywordChecks as any[]).map((k) => String(k?.keyword ?? '')).filter(Boolean).join('\n')
        : ''
    );
    setLongAnswerEnableFeedback((existingQuestion as any).longAnswer?.enableFeedback !== false);
    setExplanation(existingQuestion.explanation || '');
    setSelectedTags(existingQuestion.tags || []);
    const restoredLevel =
      existingQuestion.metadata?.difficultyLevel ??
      classicDifficultyToLevel(existingQuestion.metadata?.difficulty);
    setDifficulty(existingQuestion.metadata?.difficulty || 'medium');
    setDifficultyLevel(restoredLevel);
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

  const handleDifficultyLevelChange = (value: number) => {
    setDifficultyLevel(value);
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags((prev) => prev.filter(t => t !== tag));
  };


  const handleAddTagFromPool = (tagName: string) => {
    setSelectedTags((prev) => (prev.includes(tagName) ? prev : [...prev, tagName]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } else if (questionType === 'long_answer') {
      if (!longAnswerIdeal.trim()) {
        toast.error('Ideal answer is required for long answer questions');
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
      createdAt: existingQuestion?.metadata?.createdAt || now,
      updatedAt: now,
    };

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
      longAnswer:
        questionType === 'long_answer'
          ? {
              idealAnswerText: longAnswerIdeal.trim(),
              keywordChecks: longAnswerKeywords
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean)
                .map((keyword) => ({ keyword })),
              enableFeedback: !!longAnswerEnableFeedback,
            }
          : undefined,
      tags: selectedTags,
      modules: existingQuestion?.modules || [],
      explanation: explanation.trim() || undefined,
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
          longAnswer: (questionData as any).longAnswer,
          tags: questionData.tags,
          explanation: questionData.explanation,
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
      if (aiOrchestrator?.autoModuleAssignment?.enabled) {
        const result = await autoAssignQuestionToModules(questionId);
        if (result.assigned.length) {
          toast.success(`Auto-added to ${result.assigned.length} module${result.assigned.length > 1 ? 's' : ''}.`);
        }
      }
      invalidateTagModelCache();
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
          <MoveLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground">
            {isEditing ? 'Edit Question' : 'Create Question'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditing ? 'Update question details' : 'Add a new question to your bank'}
          </p>
        </div>
			{!isEditing && !wantsScreenshot && (
				<Button
					type="button"
					variant="outline"
					onClick={() => navigate('/questions/create?screenshot=1')}
				>
					<Upload className="h-4 w-4 mr-2" />
					Screenshot → Question
				</Button>
			)}
      </div>

      {/* Form */}
      <div className="pr-2">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Question Type */}
          <Card className="p-6">
            <Label className="text-base font-semibold">Question Type</Label>
            <RadioGroup
              value={questionType}
              onValueChange={(value: any) => {
                if (wantsScreenshot && value !== 'mcq') {
                  toast.message('Screenshot → Question works only for MCQ.');
                  return;
                }
                setQuestionType(value);
                // Reset correct answers when switching types
                setCorrectAnswers([]);
              }}
              className="mt-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="mcq" id="mcq" />
                <Label htmlFor="mcq" className="cursor-pointer">Multiple Choice</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="text" id="text" disabled={wantsScreenshot} />
                <Label htmlFor="text" className="cursor-pointer">Free Text Answer</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="long_answer" id="long_answer" disabled={wantsScreenshot} />
                <Label htmlFor="long_answer" className="cursor-pointer">Long Answer</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fill_blanks" id="fill_blanks" disabled={wantsScreenshot} />
                <Label htmlFor="fill_blanks" className="cursor-pointer">Fill in the Blanks</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="matching" id="matching" disabled={wantsScreenshot} />
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
				<div className="mt-4" onPaste={onPasteScreenshotFromClipboard} tabIndex={0}>
					{wantsScreenshot && (
						<div className="rounded-lg border bg-muted/10 p-3">
							<div className="text-xs text-muted-foreground mb-2">
								Paste a screenshot here (<span className="font-mono">Ctrl+V</span>) or upload an image.
							</div>
							<div className="relative">
								<Input
									type="file"
									accept="image/*"
									multiple
									onChange={(e) => {
										const next = Array.from(e.target.files || []);
										if (!next.length) return;
										setScreenshotFiles(next);
										setScreenshotPreviews(next.map((f) => URL.createObjectURL(f)));
										e.target.value = '';
									}}
									className="absolute inset-0 opacity-0 cursor-pointer"
									id="screenshot-question-upload"
								/>
								<Button variant="outline" type="button" className="w-full pointer-events-none">
									<Upload className="h-4 w-4 mr-2" />
									Screenshot → Question
								</Button>
							</div>
							{screenshotFiles.length > 0 && (
								<div className="mt-4 space-y-3">
									<div className="flex items-center justify-between gap-3 flex-wrap">
										<div className="text-sm text-muted-foreground">
											{screenshotFiles.length} screenshot{(screenshotFiles.length === 1 ? '' : 's')} ready
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => {
												setScreenshotFiles([]);
												screenshotPreviews.forEach((u) => URL.revokeObjectURL(u));
												setScreenshotPreviews([]);
												setOcrProgress(null);
											}}
											disabled={ocrBusy}
										>
											Clear
										</Button>
									</div>
									<ScreenshotToQuestionModal files={screenshotFiles} onApply={onApplyFromScreenshotTool} />
								</div>
							)}
						</div>
					)}
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

        {questionType === 'long_answer' && (
          <Card className="p-6 space-y-5">
            <Label className="text-base font-semibold">Ideal Answer *</Label>
            <Textarea
              value={longAnswerIdeal}
              onChange={(e) => setLongAnswerIdeal(e.target.value)}
              placeholder="Paste the ideal answer here..."
              className="min-h-[160px]"
            />

            <div className="space-y-1">
              <Label className="text-sm">Keyword / Step Checks (Optional)</Label>
              <Textarea
                value={longAnswerKeywords}
                onChange={(e) => setLongAnswerKeywords(e.target.value)}
                placeholder="One keyword or step per line..."
                className="min-h-[120px]"
              />
              <div className="text-xs text-muted-foreground">
                These are deterministic checks to complement similarity scoring.
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="long-answer-enable-feedback"
                checked={longAnswerEnableFeedback}
                onCheckedChange={(v) => setLongAnswerEnableFeedback(v === true)}
              />
              <Label htmlFor="long-answer-enable-feedback" className="cursor-pointer">
                Enable offline feedback paragraph (optional)
              </Label>
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
                    <MathLiveInput
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

        {/* Difficulty & Tags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-base font-semibold">Difficulty</Label>
                <p className="text-sm text-muted-foreground">
                  Manual 12-level scale
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
                min={1}
                max={12}
                value={difficultyLevel}
                onChange={(e) => handleDifficultyLevelChange(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-muted-foreground">Level 12</span>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <Label className="text-base font-semibold">Tags</Label>

            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  Suggestions are computed offline using cosine similarity.
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void suggestTagsFromEmbedding()}
                  disabled={tagSuggestBusy}
                  className="whitespace-nowrap"
                >
                  {tagSuggestBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Suggest tags
                </Button>
              </div>

              {tagSuggestError ? (
                <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  {tagSuggestError}
                </div>
              ) : null}

              {tagSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {tagSuggestions.map((s) => {
                    const already = selectedTags.includes(s.tagName);
                    const pct = Math.max(0, Math.min(1, s.score));
                    const label = `${Math.round(pct * 100)}%`;
                    return (
                      <Badge
                        key={s.tagName}
                        variant={already ? 'default' : 'secondary'}
                        className="gap-2 cursor-pointer transition-all hover:ring-1 hover:ring-primary/50"
                        onClick={() => {
                          if (!already) {
                            handleAddTagFromPool(s.tagName);
                            void recordTagSuggestionFeedback({ tagName: s.tagName, action: 'accept', score: s.score });
                          }
                        }}
                      >
                        <span>{s.tagName}</span>
                        <span className="text-[11px] text-muted-foreground">{label}</span>
                        {!already ? (
                          <X
                            className="h-3 w-3 cursor-pointer hover:bg-destructive/20 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTagSuggestions((prev) => prev.filter((x) => x.tagName !== s.tagName));
                              void recordTagSuggestionFeedback({ tagName: s.tagName, action: 'reject', score: s.score });
                            }}
                          />
                        ) : null}
                      </Badge>
                    );
                  })}
                </div>
              ) : null}
            </div>

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
