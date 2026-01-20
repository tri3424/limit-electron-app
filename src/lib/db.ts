import Dexie, { Table } from 'dexie';
import { DailyStats } from './statsTypes';

// Question types
export interface GlossaryEntry {
  id: string;
  word: string;
  meaning: string;
}

export interface Question {
  id: string;
  code?: string;
  text: string;
  type: 'mcq' | 'text' | 'fill_blanks' | 'matching';
  questionImages?: string[];
  questionImageAssetIds?: string[];
  options?: Array<{
    id: string;
    text: string;
    image?: string;
    images?: string[];
    imageAssetIds?: string[];
  }>;
  correctAnswers?: string[]; // option IDs for MCQ or text answers
  // For fill-in-the-blanks questions, blanks are represented inside the HTML text
  // using data-blank attributes, and this metadata stores the correct answers.
  fillBlanks?: {
    blanks: {
      id: string;
      correct: string;
    }[];
  };
  // For matching questions, pairs describe the left/right items and their mapping.
  matching?: {
    headingHtml?: string;
    pairs: {
      leftId: string;
      leftText: string;
      rightId: string;
      rightText: string;
    }[];
  };
  tags: string[];
  modules: string[]; // module IDs
  explanation?: string;
  glossary?: GlossaryEntry[];
  metadata: {
    difficulty?: 'easy' | 'medium' | 'hard';
    difficultyLevel?: number;
    difficultyBand?: string;
    typeDifficulty?: Partial<Record<Question['type'], number>>;
    subjectFamilies?: string[];
    mathProfile?: {
      density: number;
      symbolicWeight: number;
      operations: string[];
    };
    aiInsightsVersion?: number;
    autoAssignmentHistory?: {
      moduleId: string;
      source: 'auto' | 'manual';
      score?: number;
      assignedAt: number;
      accepted?: boolean;
    }[];
    createdAt: number;
    updatedAt: number;
  };
}

export interface GlobalGlossaryEntry {
  id: string;
  word: string;
  normalizedWord: string;
  meaning: string;
  questionIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CustomDictionaryEntry {
  id: string;
  word: string;
  normalizedWord: string;
  meaning: string;
  createdAt: number;
  updatedAt: number;
}

// Module types
export interface Module {
  id: string;
  title: string;
  description?: string;
  type: 'exam' | 'practice';
  questionIds: string[];
  tags: string[];
  scheduledStartUtc?: number;
  scheduledEndUtc?: number;
  settings: {
    randomizeQuestions: boolean;
    allowReview: boolean;
    timerType: 'perQuestion' | 'perModule' | 'none';
    timeLimitMinutes?: number;
    maxVisibilityLosses?: number;
    autoSubmitOnFocusLoss?: boolean;
    allowBackNavigation?: boolean;
    showInstantFeedback?: boolean;
    requireFullscreen?: boolean;
    repeatIncorrectQuestions?: boolean;
    onFocusLoss?: 'ignore' | 'autosubmit_question' | 'autosubmit_and_end';
    finalGraceSeconds?: number;
    reviewDurationSeconds?: number;
    lockModuleOnReviewExpire?: boolean;
    dailyLimit?: {
      enabled: boolean;
      maxQuestionsPerDay: number;
    };
    glossaryHints?: boolean;
    // Optional recurring availability window: restrict when a module
    // can be accessed during the week.
    allowedDaysOfWeek?: number[]; // 0 (Sunday) - 6 (Saturday), local time
    allowedTimeWindow?: {
      // Minutes from local midnight (e.g. 9:30am => 9*60+30)
      startMinutes: number;
      endMinutes: number;
    };
  };
  createdAt: number;
  updatedAt: number;
  visible?: boolean;
  locked?: boolean;
  // Optional assignment to one or more student users (by user ID)
  assignedUserIds?: string[];
}

// Attempt types
export interface PerQuestionAttempt {
  questionId: string;
  userAnswer: string | string[]; // text or option IDs
  isCorrect?: boolean;
  timeTakenMs: number;
  timestamp: number; // submit timestamp
  questionStartedAt?: number; // when the question was first viewed/started
  questionIndexInModule: number;
  attemptNumberForQuestion: number;
  integrityEvents: string[];
  integrityEventsDuringQuestion?: string[];
  status?: 'attempted' | 'unattempted' | 'autosubmitted';
  autosubmitted?: boolean;
  scorePercent?: number;
  correctParts?: number;
  totalParts?: number;
}

export type TimerState = {
  startUtc: number;
  expectedDurationMs: number;
  elapsedMs: number;
  paused: boolean;
  mode: 'perModule' | 'perQuestion';
  questionId?: string;
};

export interface Attempt {
  id: string;
  moduleId: string;
  type: 'exam' | 'practice';
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  score?: number;
  timerState?: TimerState;
  currentQuestionIndex?: number;
  answers?: Record<string, string | string[]>;
  visibilityLosses?: number;
  currentQuestionTimerState?: TimerState;
  questionOrder?: string[];
  perQuestionAttempts: PerQuestionAttempt[];
  integrityEvents: IntegrityEvent[];
  timeRemainingMs?: number;
  syncStatus: 'local' | 'synced';
  userProfile?: {
    name?: string;
    email?: string;
  };
  browserInfo?: string;
  completed: boolean;
  finalized?: boolean;
  userId?: string;
  // Optional scheduling metadata for exams: planned start and end times
  scheduledStartUtc?: number;
  scheduledEndUtc?: number;
}

export interface PracticeEventRecord {
  id: string;
  userId: string;
  username?: string;
  mode: 'individual' | 'mixed';
  topicId?: string;
  difficulty?: string;
  variantId?: string;
  mixedModuleId?: string;
  questionId: string;
  questionKind?: string;
  shownAt: number;
  submittedAt?: number;
  nextAt?: number;
  userAnswer?: string;
  isCorrect?: boolean;
  snapshotJson?: string;
  createdAt: number;
}

// Integrity event types
export type IntegrityEventType =
  | 'visibility_change'
  | 'focus_lost'
  | 'focus_gain'
  | 'clock_drift'
  | 'tab_change'
  | 'fullscreen_exit'
  | 'right_click'
  | 'keyboard_shortcut'
  | 'auto_submit'
  | 'max_visibility_loss_exceeded'
  | 'leader_switch'
  | 'screenshot_captured';

export interface IntegrityEvent {
  id: string;
  attemptId: string;
  type: IntegrityEventType;
  timestamp: number;
  details?: string;
}

// Tag types
export interface Tag {
  id: string;
  name: string;
  createdAt: number;
}

export type SemanticOntologyTagKind = 'topic' | 'subtopic' | 'skill' | 'operation' | 'prerequisite' | 'other';

export interface SemanticOntologyTag {
  id: string;
  name: string;
  kind: SemanticOntologyTagKind;
  description: string;
  parentId?: string;
  aliases?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SemanticEmbeddingRecord {
  id: string;
  scope: 'ontology_tag' | 'ontology_alias' | 'question';
  scopeId: string;
  modelId: string;
  dims: number;
  vector: number[];
  textHash: string;
  createdAt: number;
}

export type SemanticAnnotationSource = 'ai' | 'user';

export interface QuestionSemanticTagAssignment {
  tagId: string;
  tagName: string;
  score: number;
  rank: number;
  explanation?: string;
}

export interface QuestionSemanticDifficultyFactors {
  semanticComplexity: number;
  conceptualDepth: number;
  reasoningSteps: number;
  abstractionLevel: number;
  symbolDensity: number;
  prerequisiteLoad: number;
}

export interface QuestionSemanticAnalysis {
  id: string;
  questionId: string;
  inputHash: string;
  modelId: string;
  analysisVersion: number;
  source: SemanticAnnotationSource;
  createdAt: number;
  tags: QuestionSemanticTagAssignment[];
  difficultyScore: number;
  difficultyBand: 'very_easy' | 'easy' | 'moderate' | 'hard' | 'very_hard' | 'olympiad';
  difficultyFactors: QuestionSemanticDifficultyFactors;
  rationale: {
    topSignals: Array<{ label: string; weight: number; detail?: string }>;
    activatedNodes?: Array<{
      tagId: string;
      tagName: string;
      finalScore: number;
      baseSimilarity: number;
      heuristicBoost: number;
      propagatedFromChildren: number;
      propagatedToChildren: number;
      depth: number;
    }>;
    hierarchy?: {
      rootsActivated: Array<{ tagId: string; tagName: string; score: number }>;
      siblingSuppressionApplied: boolean;
    };
    heuristics?: Array<{
      key: string;
      score: number;
      contributedTo: Array<{ tagId: string; weight: number }>;
    }>;
    difficultyComponents?: {
      foundationalDistance: number;
      abstractionDepth: number;
      reasoningChain: number;
      prerequisiteBreadth: number;
      consistencyAdjustment: number;
      calibratedScore?: number;
    };
    consistency?: Array<{ rule: string; delta: number; detail?: string }>;
  };
}

export interface QuestionSemanticOverride {
  id: string;
  questionId: string;
  baseAnalysisId: string;
  createdAt: number;
  updatedAt: number;
  tags?: {
    applied: QuestionSemanticTagAssignment[];
  };
  difficulty?: {
    difficultyScore: number;
    difficultyBand: QuestionSemanticAnalysis['difficultyBand'];
    difficultyFactors?: Partial<QuestionSemanticDifficultyFactors>;
  };
  notes?: string;
}

// User types
export interface User {
  id: string;
  username: string;
  password: string; // In production, this should be hashed
  createdAt: number;
}

export interface AdminAccount {
  id: string;
  username: string;
  secret: {
    cipherTextB64: string;
    ivB64: string;
    saltB64: string;
  };
  createdAt: number;
}

// Settings types
export interface AppSettings {
  id: string; // always '1' - single record
  theme: 'light' | 'dark' | 'auto';
  questionPrompts?: { id: string; title: string; content: string }[];
  songRecognitionEnabled?: boolean;
  practiceTopicLocks?: Partial<Record<import('@/lib/practiceTopics').PracticeTopicId, boolean>>;
  practiceTopicLocksByUserKey?: Record<string, Partial<Record<import('@/lib/practiceTopics').PracticeTopicId, boolean>>>;
  practiceTopicHidden?: Partial<Record<import('@/lib/practiceTopics').PracticeTopicId, boolean>>;
  practiceTopicHiddenByUserKey?: Record<string, Partial<Record<import('@/lib/practiceTopics').PracticeTopicId, boolean>>>;
  practiceFrequencies?: {
    byUserKey: Record<
      string,
      {
        topicVariantWeights?: Partial<Record<import('@/lib/practiceTopics').PracticeTopicId, Record<string, number>>>;
        mixedModuleItemWeights?: Record<string, Record<number, number>>;
      }
    >;
  };
  practiceHistory?: {
    recentQuestionIds: string[];
    recentWordProblemCategories: string[];
    updatedAt: number;
  };
  mixedPracticeModules?: Array<
    | {
        id: string;
        title: string;
        type?: 'items';
        items: {
          topicId: import('@/lib/practiceTopics').PracticeTopicId;
          difficulty: import('@/lib/practiceGenerators/quadraticFactorization').PracticeDifficulty;
        }[];
        schedule?: {
          enabled: boolean;
          // Legacy: date-based scheduling
          opensAt?: number;
          closesAt?: number;
          // New: day-based scheduling
          daysOfWeek?: number[]; // 0=Sun..6=Sat
          opensTime?: string; // HH:MM (24h)
          closesTime?: string; // HH:MM (24h)
        };
        assignedUserIds?: string[];
        createdAt: number;
        updatedAt: number;
      }
    | {
        id: string;
        title: string;
        type: 'pool';
        pool: Array<{
          topicId: import('@/lib/practiceTopics').PracticeTopicId;
          weight: number;
          difficultyMode: 'fixed' | 'mix' | 'auto';
          difficulty?: import('@/lib/practiceGenerators/quadraticFactorization').PracticeDifficulty;
          difficultyWeights?: Partial<Record<import('@/lib/practiceGenerators/quadraticFactorization').PracticeDifficulty, number>>;
        }>;
        schedule?: {
          enabled: boolean;
          // Legacy: date-based scheduling
          opensAt?: number;
          closesAt?: number;
          // New: day-based scheduling
          daysOfWeek?: number[]; // 0=Sun..6=Sat
          opensTime?: string; // HH:MM (24h)
          closesTime?: string; // HH:MM (24h)
        };
        assignedUserIds?: string[];
        createdAt: number;
        updatedAt: number;
      }
  >;
  examIntegrity: {
    requireFullscreen: boolean;
    autoSubmitOnTabChange: boolean;
    blockRightClick: boolean;
    maxVisibilityLosses: number;
    blockKeyboardShortcuts: boolean;
  };
  defaultModuleOptions: {
    timerDefault: number; // milliseconds
    randomizeDefault: boolean;
  };
  userProfile: {
    name?: string;
    email?: string;
  };
  analytics: {
    enabled: boolean;
  };
  dailyLimit?: {
    enabled: boolean;
    maxQuestionsPerDay: number;
  };
  aiOrchestrator?: {
    analysisVersion: number;
    difficultyLevels: number;
    autoDifficulty: boolean;
    autoModuleAssignment: {
      enabled: boolean;
      maxModulesPerQuestion: number;
      learningRate: number;
      respectManualRemovals: boolean;
      includeExistingUnassigned: boolean;
    };
  };


  semanticTuning?: {
    enabled: boolean;
    updatedAt: number;
    // Deterministic parameters derived from local corpus (no online learning)
    tagThreshold: number;
    siblingLambda: number;
    upBeta: number;
    downGamma: number;
    targetAvgTags: number;
  };


	semanticAutoApply?: {
		enabled: boolean;
		updatedAt: number;
		applyTags: boolean;
		applyDifficulty: boolean;
		maxTags: number;
		minScore: number;
		preserveExistingQuestionTags: boolean;
		preserveExistingDifficulty: boolean;
	};
}

export interface IntelligenceSignal {
  id: string;
  type: 'difficulty_override' | 'difficulty_auto' | 'module_auto_add' | 'module_removed' | 'module_confirmed';
  questionId: string;
  moduleId?: string;
  payload?: Record<string, any>;
  createdAt: number;
}

// Review interaction tracking
export interface ReviewInteraction {
  id: string;
  attemptId: string;
  moduleId: string;
  userId: string;
  questionId: string;
  timestamp: number;
}

export interface ErrorReport {
  id: string;
  status: 'new' | 'read' | 'fixed';
  message: string;
  screenshotDataUrl?: string;
  createdAt: number;
  updatedAt: number;

  // Context metadata
  route?: string;
  moduleId?: string;
  moduleTitle?: string;
  questionId?: string;
  questionCode?: string;
  questionTags?: string[];
  attemptId?: string;
  phase?: 'exam' | 'review' | 'practice' | 'unknown';

	// Capture context (purely offline diagnostics)
	currentQuestionIndex?: number;
	scrollY?: number;
	viewportWidth?: number;
	viewportHeight?: number;
	appState?: Record<string, any>;

  // Reporter metadata
  reporterUserId?: string;
  reporterUsername?: string;
}

export interface Song {
  id: string;
  title: string;
  singer: string;
  writer: string;
  lyrics: string;
  audioFilePath: string;
  audioFileUrl: string;
  audioAssetId?: string;
  createdAt: number;
  updatedAt: number;
  visible?: boolean;
}

export interface LyricsSourceEntry {
	id: string;
	normalizedEnglishTitle: string;
	englishTitle: string;
	lyrics: string;
	writer?: string;
	createdAt: number;
}

export interface BinaryAsset {
	id: string;
	kind: 'question_image' | 'option_image' | 'song_audio' | 'unknown';
	mimeType: string;
	data: Blob;
	sourceUrl?: string;
	createdAt: number;
}

export interface SongModule {
	id: string;
	title: string;
	description?: string;
	songIds: string[];
	assignedUserIds: string[];
	createdAt: number;
	updatedAt: number;
	visible?: boolean;
}

export interface SongListeningEvent {
	id: string;
	date: string; // YYYY-MM-DD
	timestamp: number;
	userId?: string;
	username?: string;
	songModuleId: string;
	songId: string;
	songTitle?: string;
	eventType: 'play' | 'pause' | 'ended' | 'switch' | 'view_start' | 'view_end';
	positionSec?: number;
	songDurationSec?: number;
	listenedMs?: number;
	timeInSongMs?: number;
	lyricsScrollable?: boolean;
	didScrollLyrics?: boolean;
}

export interface SongSrtCue {
	id: string;
	songId: string;
	cueIndex: number;
	startMs: number;
	endMs: number;
	text: string;
	createdAt: number;
}

export interface StoryCourse {
	id: string;
	title: string;
	description?: string;
	chapterIds: string[];
	assignedUserIds?: string[];
	visible?: boolean;
	createdAt: number;
	updatedAt: number;
}

export type StoryAssignmentAnswer = 'yes' | 'no';

export interface StoryChapter {
	id: string;
	courseId: string;
	title: string;
	order: number;
	storyHtml: string;
	fillBlanks: {
		blanks: {
			id: string;
			correct: string;
		}[];
	};
	assignment?: {
		statements: {
			id: string;
			text: string;
			correct: StoryAssignmentAnswer;
		}[];
	};
	visible?: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface StoryChapterAttempt {
	id: string;
	userId: string;
	username?: string;
	courseId: string;
	chapterId: string;
	date: string; // YYYY-MM-DD
	attemptNo: number; // 1..3
	startedAt: number;
	submittedAt: number;
	durationMs: number;
	blanks: {
		blankId: string;
		answer: string;
		correct: boolean;
	}[];
	assignment?: {
		statementId: string;
		answer: StoryAssignmentAnswer;
		correct: boolean;
	}[];
	accuracyPercent: number;
	lockedBlankIds: string[];
}

export interface StoryChapterProgress {
	id: string;
	userId: string;
	courseId: string;
	chapterId: string;
	completedAt: number;
	bestAccuracyPercent: number;
	attemptsUsed: number;
}

// Database class
export class ExamDatabase extends Dexie {
  questions!: Table<Question, string>;
  modules!: Table<Module, string>;
  attempts!: Table<Attempt, string>;
  integrityEvents!: Table<IntegrityEvent, string>;
  tags!: Table<Tag, string>;
  semanticOntologyTags!: Table<SemanticOntologyTag, string>;
  semanticEmbeddings!: Table<SemanticEmbeddingRecord, string>;
  questionSemanticAnalyses!: Table<QuestionSemanticAnalysis, string>;
  questionSemanticOverrides!: Table<QuestionSemanticOverride, string>;
  settings!: Table<AppSettings, string>;
  dailyStats!: Table<DailyStats, string>;
  users!: Table<User, string>;
  globalGlossary!: Table<GlobalGlossaryEntry, string>;
  intelligenceSignals!: Table<IntelligenceSignal, string>;
  reviewInteractions!: Table<ReviewInteraction, string>;
  errorReports!: Table<ErrorReport, string>;
	songs!: Table<Song, string>;
	songModules!: Table<SongModule, string>;
	songListeningEvents!: Table<SongListeningEvent, string>;
	songSrtCues!: Table<SongSrtCue, string>;
	binaryAssets!: Table<BinaryAsset, string>;
	lyricsSource!: Table<LyricsSourceEntry, string>;
	practiceEvents!: Table<PracticeEventRecord, string>;
	storyCourses!: Table<StoryCourse, string>;
	storyChapters!: Table<StoryChapter, string>;
	storyAttempts!: Table<StoryChapterAttempt, string>;
	storyChapterProgress!: Table<StoryChapterProgress, string>;
	admins!: Table<AdminAccount, string>;
	customDictionary!: Table<CustomDictionaryEntry, string>;

  constructor() {
    super('ExamDatabase');
    
    this.version(1).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, metadata.createdAt',
      attempts: 'id, moduleId, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
    });
    this.version(2).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
    }).upgrade(async (tx) => {
      // Migrate Modules: reshape settings and metadata
      const allModules = await tx.table('modules').toArray();
      for (const m of allModules as any[]) {
        const oldSettings = m.settings || {};
        const perModuleMs = oldSettings.perModuleTimerMs;
        const perQuestionMs = oldSettings.perQuestionTimerMs;
        let timerType: 'perQuestion' | 'perModule' | 'none' = 'none';
        let timeLimitMinutes: number | undefined = undefined;
        if (typeof perQuestionMs === 'number' && perQuestionMs > 0) {
          timerType = 'perQuestion';
          timeLimitMinutes = Math.round(perQuestionMs / 60000);
        } else if (typeof perModuleMs === 'number' && perModuleMs > 0) {
          timerType = 'perModule';
          timeLimitMinutes = Math.round(perModuleMs / 60000);
        }
        const type = m.type as 'exam' | 'practice';
        const newSettings = {
          randomizeQuestions: !!oldSettings.randomize,
          allowReview: type === 'practice' ? true : !!oldSettings.allowReview,
          timerType,
          timeLimitMinutes,
          maxVisibilityLosses: oldSettings.maxVisibilityLosses ?? (type === 'exam' ? 3 : undefined),
          autoSubmitOnFocusLoss: oldSettings.autoSubmitOnVisibilityLoss ?? (type === 'exam' ? true : false),
          allowBackNavigation: oldSettings.allowBackNavigation ?? (type === 'practice' ? true : false),
          showInstantFeedback: type === 'practice' ? true : false,
          requireFullscreen: type === 'exam' ? true : false,
          repeatIncorrectQuestions: type === 'practice' ? false : undefined,
        };
        const createdAt = m.metadata?.createdAt ?? Date.now();
        const updatedAt = m.metadata?.updatedAt ?? createdAt;
        await tx.table('modules').update(m.id, {
          settings: newSettings,
          createdAt,
          updatedAt,
        });
      }
      // Migrate Attempts: add type, move metadata fields, add completed flag
      const allAttempts = await tx.table('attempts').toArray();
      for (const a of allAttempts as any[]) {
        // Infer type from module
        let type: 'exam' | 'practice' = 'practice';
        try {
          const mod = await tx.table('modules').get(a.moduleId);
          if (mod && (mod as any).type) {
            type = (mod as any).type;
          }
        } catch {}
        const completed = a.metadata?.completed ?? !!a.endedAt;
        const browserInfo = a.metadata?.browserInfo;
        await tx.table('attempts').update(a.id, {
          type,
          completed,
          browserInfo,
        });
      }
    });
    this.version(3).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
    }).upgrade(async (tx) => {
      const attemptsTable = tx.table('attempts');
      const attempts = await attemptsTable.toArray();
      for (const a of attempts as any[]) {
        const timerState = a.timerState ?? (a.startedAt
          ? {
              startUtc: a.startedAt,
              expectedDurationMs: a.durationMs ?? 0,
              elapsedMs: a.durationMs ?? 0,
              paused: false,
              mode: 'perModule',
            }
          : undefined);
        await attemptsTable.update(a.id, {
          timerState,
          answers: a.answers ?? {},
          visibilityLosses: a.visibilityLosses ?? 0,
          currentQuestionIndex: a.currentQuestionIndex ?? 0,
          questionOrder: a.questionOrder ?? [],
        });
      }
    });

    // v4: add advanced lockdown/review fields and defaults + dailyStats table
    this.version(4).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
      dailyStats: 'id, date, moduleId, moduleType, createdAt',
    }).upgrade(async (tx) => {
      const modulesTable = tx.table('modules');
      const all = await modulesTable.toArray();
      for (const m of all as any[]) {
        const type = (m.type as 'exam' | 'practice') || 'practice';
        const s = m.settings || {};
        const onFocusLoss = s.onFocusLoss ?? (type === 'exam' ? 'autosubmit_question' : 'ignore');
        const finalGraceSeconds = s.finalGraceSeconds ?? 3;
        const reviewDurationSeconds = s.reviewDurationSeconds ?? 300;
        const lockModuleOnReviewExpire = s.lockModuleOnReviewExpire ?? true;
        const visible = typeof m.visible === 'boolean' ? m.visible : true;
        const locked = typeof m.locked === 'boolean' ? m.locked : false;
        await modulesTable.update(m.id, {
          settings: {
            ...s,
            onFocusLoss,
            finalGraceSeconds,
            reviewDurationSeconds,
            lockModuleOnReviewExpire,
          },
          visible,
          locked,
        });
      }
      // Attempts: ensure per-question status defaults
      const attemptsTable = tx.table('attempts');
      const attempts = await attemptsTable.toArray();
      for (const a of attempts as any[]) {
        const pqa = Array.isArray(a.perQuestionAttempts) ? a.perQuestionAttempts : [];
        const fixed = pqa.map((q: any) => ({
          ...q,
          status: q.status || (typeof q.isCorrect === 'boolean' ? 'attempted' : 'unattempted'),
          autosubmitted: q.autosubmitted || false,
        }));
        await attemptsTable.update(a.id, { perQuestionAttempts: fixed, finalized: a.finalized ?? !!a.completed });
      }
    });

    this.version(5).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
    }).upgrade(async (tx) => {
      const questionsTable = tx.table('questions');
      const all = await questionsTable.toArray();
      for (const q of all as any[]) {
        if (!q.code) {
          const baseId = typeof q.id === 'string' && q.id.length >= 8 ? q.id : String(q.id ?? '');
          const suffix = baseId ? baseId.slice(0, 8) : Math.random().toString(36).slice(2, 10);
          await questionsTable.update(q.id, { code: `Q-${suffix}` });
        }
      }
    });

    // v6: add compound indexes to dailyStats for date+moduleId queries
    this.version(6).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
    });
    
    // v7: add dailyLimit to settings
    this.version(7).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
    }).upgrade(async (tx) => {
      const settingsTable = tx.table('settings');
      const settings = await settingsTable.get('1');
      if (settings) {
        await settingsTable.update('1', {
          dailyLimit: {
            enabled: false,
            maxQuestionsPerDay: 50,
          },
        });
      }
    });

    // v8: add users table
    this.version(8).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
      users: 'id, username',
    });

    // v9: add glossary support on questions
    this.version(9).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
      users: 'id, username',
    }).upgrade(async (tx) => {
      const questionsTable = tx.table('questions');
      await questionsTable.toCollection().modify((q: any) => {
        if (!Array.isArray(q.glossary)) {
          q.glossary = [];
        } else {
          q.glossary = q.glossary
            .filter((entry: any) => entry && entry.word && entry.meaning)
            .map((entry: any) => ({
              id: entry.id || `${entry.word}-${entry.meaning}`.slice(0, 24),
              word: entry.word,
              meaning: entry.meaning,
            }));
        }
      });
    });

    // v10: add shared glossary table
    this.version(10).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
      users: 'id, username',
      globalGlossary: 'id, normalizedWord, word'
    }).upgrade(async (tx) => {
      const questionsTable = tx.table('questions');
      const glossaryTable = tx.table('globalGlossary');
      const seen = new Set<string>();
      const questions = await questionsTable.toArray();
      for (const question of questions as any[]) {
        const entries = Array.isArray(question.glossary) ? question.glossary : [];
        for (const entry of entries) {
          if (!entry?.word || !entry?.meaning) continue;
          const normalizedWord = normalizeGlossaryWord(entry.word);
          if (!normalizedWord) continue;
          const normalizedMeaning = normalizeGlossaryMeaning(entry.meaning);
          const key = `${normalizedWord}::${normalizedMeaning}`;
          if (seen.has(key)) continue;
          seen.add(key);
          await glossaryTable.add({
            id: `${normalizedWord}-${Math.random().toString(36).slice(2, 8)}`,
            word: entry.word,
            normalizedWord,
            meaning: entry.meaning,
            questionIds: [question.id].filter(Boolean),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    });

    // v11: ensure modules have glossary hint flag
    this.version(11).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
      users: 'id, username',
      globalGlossary: 'id, normalizedWord, word'
    }).upgrade(async (tx) => {
      const modulesTable = tx.table('modules');
      await modulesTable.toCollection().modify((mod: any) => {
        if (!mod.settings) mod.settings = {};
        if (typeof mod.settings.glossaryHints === 'undefined') {
          mod.settings.glossaryHints = true;
        }
      });
    });

    // v12: normalize global glossary keys with stemming
    this.version(12).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
      users: 'id, username',
      globalGlossary: 'id, normalizedWord, word'
    }).upgrade(async (tx) => {
      const glossaryTable = tx.table('globalGlossary');
      const entries = await glossaryTable.toArray();
      const seen = new Map<string, GlobalGlossaryEntry>();
      const now = Date.now();
      for (const entry of entries) {
        if (!entry || !entry.word || !entry.meaning) {
          await glossaryTable.delete(entry?.id);
          continue;
        }
        const normalizedWord = normalizeGlossaryWord(entry.word);
        const normalizedMeaning = normalizeGlossaryMeaning(entry.meaning);
        if (!normalizedWord || !normalizedMeaning) {
          await glossaryTable.delete(entry.id);
          continue;
        }
        const key = `${normalizedWord}::${normalizedMeaning}`;
        if (seen.has(key)) {
          const primary = seen.get(key)!;
          const mergedIds = Array.from(new Set([...(primary.questionIds || []), ...(entry.questionIds || [])]));
          await glossaryTable.update(primary.id, {
            questionIds: mergedIds,
            updatedAt: now,
          });
          await glossaryTable.delete(entry.id);
        } else {
          seen.set(key, entry);
          await glossaryTable.update(entry.id, {
            normalizedWord,
            questionIds: Array.from(new Set(entry.questionIds || [])),
            updatedAt: now,
          });
        }
      }
    });

    // v13: add intelligence signals table and AI orchestrator defaults
    this.version(13).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
      users: 'id, username',
      globalGlossary: 'id, normalizedWord, word',
      intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
      reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
    }).upgrade(async (tx) => {
      const settingsTable = tx.table('settings');
      const existing = await settingsTable.get('1');
      if (existing) {
        const updated = {
          aiOrchestrator: {
            analysisVersion: existing.aiOrchestrator?.analysisVersion ?? 1,
            difficultyLevels: existing.aiOrchestrator?.difficultyLevels ?? 12,
            autoDifficulty: existing.aiOrchestrator?.autoDifficulty ?? false,
            autoModuleAssignment: {
              enabled: existing.aiOrchestrator?.autoModuleAssignment?.enabled ?? false,
              maxModulesPerQuestion: existing.aiOrchestrator?.autoModuleAssignment?.maxModulesPerQuestion ?? 2,
              learningRate: existing.aiOrchestrator?.autoModuleAssignment?.learningRate ?? 0.35,
              respectManualRemovals: existing.aiOrchestrator?.autoModuleAssignment?.respectManualRemovals ?? true,
              includeExistingUnassigned: existing.aiOrchestrator?.autoModuleAssignment?.includeExistingUnassigned ?? false,
            },
          },
        };
        await settingsTable.update('1', updated);
      }
    });

    // v14: add error reports table (student issue reporting)
    this.version(14).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
      users: 'id, username',
      globalGlossary: 'id, normalizedWord, word',
      intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
      reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
      errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]'
    });

    this.version(15).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
      semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
      questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
      questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
      users: 'id, username',
      globalGlossary: 'id, normalizedWord, word',
      intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
      reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
      errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]'
    });

    this.version(16).stores({
      questions: 'id, type, *tags, *modules, metadata.createdAt',
      modules: 'id, type, *tags, createdAt, visible, locked',
      attempts: 'id, moduleId, type, startedAt, syncStatus',
      integrityEvents: 'id, attemptId, type, timestamp',
      tags: 'id, name',
      semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
      semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
      questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
      questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
      settings: 'id',
      dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
      users: 'id, username',
      globalGlossary: 'id, normalizedWord, word',
      intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
      reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
      errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]'
    }).upgrade(async () => {
      // No-op: index addition only
    });

		// v17: add songs table
		this.version(17).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt'
		});

		// v18: add song modules table
		this.version(18).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt',
			songModules: 'id, visible, createdAt, updatedAt'
		});

		// v19: add song listening analytics table
		this.version(19).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt',
			songModules: 'id, visible, createdAt, updatedAt',
			songListeningEvents: 'id, date, timestamp, songModuleId, userId, songId, [date+songModuleId], [songModuleId+date], [songModuleId+userId], [songModuleId+songId]'
		});

		// v20: add file-based question/option image references on questions
		this.version(20).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt',
			songModules: 'id, visible, createdAt, updatedAt',
			songListeningEvents: 'id, date, timestamp, songModuleId, userId, songId, [date+songModuleId], [songModuleId+date], [songModuleId+userId], [songModuleId+songId]'
		});

		// v21: store binary blobs (images/audio) directly in IndexedDB
		this.version(21).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt',
			songModules: 'id, visible, createdAt, updatedAt',
			songListeningEvents: 'id, date, timestamp, songModuleId, userId, songId, [date+songModuleId], [songModuleId+date], [songModuleId+userId], [songModuleId+songId]',
			binaryAssets: 'id, kind, createdAt'
		});

		this.version(22).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt',
			songModules: 'id, visible, createdAt, updatedAt',
			songListeningEvents: 'id, date, timestamp, songModuleId, userId, songId, [date+songModuleId], [songModuleId+date], [songModuleId+userId], [songModuleId+songId]',
			binaryAssets: 'id, kind, createdAt',
			lyricsSource: 'id, normalizedEnglishTitle, createdAt'
		});

		this.version(23).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt',
			songModules: 'id, visible, createdAt, updatedAt',
			songListeningEvents: 'id, date, timestamp, songModuleId, userId, songId, [date+songModuleId], [songModuleId+date], [songModuleId+userId], [songModuleId+songId]',
			binaryAssets: 'id, kind, createdAt',
			lyricsSource: 'id, normalizedEnglishTitle, createdAt, writer'
		});

		// v24: store parsed timestamped lyrics per song (SRT cues)
		this.version(24).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt',
			songModules: 'id, visible, createdAt, updatedAt',
			songListeningEvents: 'id, date, timestamp, songModuleId, userId, songId, [date+songModuleId], [songModuleId+date], [songModuleId+userId], [songModuleId+songId]',
			binaryAssets: 'id, kind, createdAt',
			lyricsSource: 'id, normalizedEnglishTitle, createdAt, writer',
			songSrtCues: 'id, songId, cueIndex, [songId+cueIndex], startMs, endMs, text'
		});

		this.version(25).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt',
			songModules: 'id, visible, createdAt, updatedAt',
			songListeningEvents: 'id, date, timestamp, songModuleId, userId, songId, [date+songModuleId], [songModuleId+date], [songModuleId+userId], [songModuleId+songId]',
			binaryAssets: 'id, kind, createdAt',
			lyricsSource: 'id, normalizedEnglishTitle, createdAt, writer',
			songSrtCues: 'id, songId, cueIndex, [songId+cueIndex], startMs, endMs, text',
			practiceEvents:
				'id, userId, questionId, shownAt, submittedAt, nextAt, mode, topicId, mixedModuleId, [userId+shownAt], [userId+submittedAt], [topicId+shownAt], [mode+shownAt]'
		});

		// v26: add Stories / Courses tables
		this.version(26).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt',
			songModules: 'id, visible, createdAt, updatedAt',
			songListeningEvents: 'id, date, timestamp, songModuleId, userId, songId, [date+songModuleId], [songModuleId+date], [songModuleId+userId], [songModuleId+songId]',
			binaryAssets: 'id, kind, createdAt',
			lyricsSource: 'id, normalizedEnglishTitle, createdAt, writer',
			songSrtCues: 'id, songId, cueIndex, [songId+cueIndex], startMs, endMs, text',
			practiceEvents:
				'id, userId, questionId, shownAt, submittedAt, nextAt, mode, topicId, mixedModuleId, [userId+shownAt], [userId+submittedAt], [topicId+shownAt], [mode+shownAt]',
			storyCourses: 'id, visible, createdAt, updatedAt',
			storyChapters: 'id, courseId, order, visible, createdAt, updatedAt, [courseId+order]',
			storyAttempts: 'id, userId, courseId, chapterId, date, attemptNo, submittedAt, [chapterId+userId], [userId+date], [chapterId+date], [chapterId+userId+attemptNo]',
			storyChapterProgress: 'id, userId, courseId, chapterId, completedAt, [chapterId+userId], [courseId+userId]'
		});

		// v27: add admin accounts table
		this.version(27).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			admins: 'id, username, createdAt',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt',
			songModules: 'id, visible, createdAt, updatedAt',
			songListeningEvents: 'id, date, timestamp, songModuleId, userId, songId, [date+songModuleId], [songModuleId+date], [songModuleId+userId], [songModuleId+songId]',
			binaryAssets: 'id, kind, createdAt',
			lyricsSource: 'id, normalizedEnglishTitle, createdAt, writer',
			songSrtCues: 'id, songId, cueIndex, [songId+cueIndex], startMs, endMs, text',
			practiceEvents:
				'id, userId, questionId, shownAt, submittedAt, nextAt, mode, topicId, mixedModuleId, [userId+shownAt], [userId+submittedAt], [topicId+shownAt], [mode+shownAt]',
			storyCourses: 'id, visible, createdAt, updatedAt',
			storyChapters: 'id, courseId, order, visible, createdAt, updatedAt, [courseId+order]',
			storyAttempts: 'id, userId, courseId, chapterId, date, attemptNo, submittedAt, [chapterId+userId], [userId+date], [chapterId+date], [chapterId+userId+attemptNo]',
			storyChapterProgress: 'id, userId, courseId, chapterId, completedAt, [chapterId+userId], [courseId+userId]'
		});

		// v28: add custom dictionary table
		this.version(28).stores({
			questions: 'id, type, *tags, *modules, metadata.createdAt',
			modules: 'id, type, *tags, createdAt, visible, locked',
			attempts: 'id, moduleId, type, startedAt, syncStatus',
			integrityEvents: 'id, attemptId, type, timestamp',
			tags: 'id, name',
			semanticOntologyTags: 'id, kind, parentId, name, updatedAt',
			semanticEmbeddings: 'id, [scope+scopeId], scope, scopeId, modelId, createdAt',
			questionSemanticAnalyses: 'id, questionId, createdAt, [questionId+analysisVersion], [questionId+modelId], source',
			questionSemanticOverrides: 'id, questionId, updatedAt, baseAnalysisId, [questionId+updatedAt]',
			settings: 'id',
			dailyStats: 'id, date, moduleId, [date+moduleId], [moduleId+date], moduleType, createdAt',
			users: 'id, username',
			admins: 'id, username, createdAt',
			customDictionary: 'id, normalizedWord, word, updatedAt, createdAt',
			globalGlossary: 'id, normalizedWord, word',
			intelligenceSignals: 'id, type, questionId, moduleId, [type+moduleId], [questionId+type]',
			reviewInteractions: 'id, attemptId, moduleId, userId, questionId, timestamp, [attemptId+questionId], [moduleId+userId]',
			errorReports: 'id, status, createdAt, updatedAt, moduleId, questionId, questionCode, reporterUserId, [status+createdAt]',
			songs: 'id, visible, createdAt, updatedAt',
			songModules: 'id, visible, createdAt, updatedAt',
			songListeningEvents: 'id, date, timestamp, songModuleId, userId, songId, [date+songModuleId], [songModuleId+date], [songModuleId+userId], [songModuleId+songId]',
			binaryAssets: 'id, kind, createdAt',
			lyricsSource: 'id, normalizedEnglishTitle, createdAt, writer',
			songSrtCues: 'id, songId, cueIndex, [songId+cueIndex], startMs, endMs, text',
			practiceEvents:
				'id, userId, questionId, shownAt, submittedAt, nextAt, mode, topicId, mixedModuleId, [userId+shownAt], [userId+submittedAt], [topicId+shownAt], [mode+shownAt]',
			storyCourses: 'id, visible, createdAt, updatedAt',
			storyChapters: 'id, courseId, order, visible, createdAt, updatedAt, [courseId+order]',
			storyAttempts: 'id, userId, courseId, chapterId, date, attemptNo, submittedAt, [chapterId+userId], [userId+date], [chapterId+date], [chapterId+userId+attemptNo]',
			storyChapterProgress: 'id, userId, courseId, chapterId, completedAt, [chapterId+userId], [courseId+userId]'
		});
	}
}

function stemWord(word: string): string {
  let w = word;
  if (w.endsWith("'s")) {
    w = w.slice(0, -2);
  }
  if (w.endsWith('ies') && w.length >= 5) {
    return w.slice(0, -3) + 'y';
  }
  if (w.endsWith('ing') && w.length >= 5) {
    return w.slice(0, -3);
  }
  if (w.endsWith('ed') && w.length >= 4) {
    return w.slice(0, -2);
  }
  if (w.length >= 4 && w.endsWith('es')) {
    const base = w.slice(0, -2);
    const lastTwo = base.slice(-2);
    const lastOne = base.slice(-1);
    if (
      ['s', 'x', 'z'].includes(lastOne) ||
      ['sh', 'ch'].includes(lastTwo)
    ) {
      return base;
    }
    // otherwise fall through to remove single 's'
  }
  if (w.endsWith('s') && !w.endsWith('ss') && w.length >= 3) {
    return w.slice(0, -1);
  }
  return w;
}

export function normalizeGlossaryWord(value: string): string {
  const cleaned =
    value
      ?.toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || '';
  if (!cleaned) return '';
  return stemWord(cleaned);
}

export function normalizeGlossaryMeaning(value: string): string {
  return value
    ?.toLowerCase()
    .replace(/\s+/g, ' ')
    .trim() || '';
}

export function normalizeDictionaryWord(value: string): string {
  const cleaned =
    value
      ?.toLowerCase()
      .replace(/[^a-z0-9\u0980-\u09FF\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || '';
  if (!cleaned) return '';
  // Apply English stemming only when the token is purely Latin.
  if (/^[a-z0-9\s'-]+$/.test(cleaned)) {
    return stemWord(cleaned);
  }
  return cleaned;
}

// Initialize database
export const db = new ExamDatabase();

// Initialize default settings
export async function initializeSettings() {
  let existingSettings: AppSettings | undefined;
  try {
    existingSettings = await db.settings.get('1');
  } catch (e) {
    console.error(e);
    throw e;
  }
  
  if (!existingSettings) {
      const defaultSettings: AppSettings = {
      id: '1',
      theme: 'auto',
      questionPrompts: [],
      songRecognitionEnabled: false,
      practiceTopicLocks: {},
      practiceTopicLocksByUserKey: {},
      practiceTopicHidden: {},
      practiceTopicHiddenByUserKey: {},
      practiceFrequencies: {
        byUserKey: {},
      },
      practiceHistory: {
        recentQuestionIds: [],
        recentWordProblemCategories: [],
        updatedAt: Date.now(),
      },
      mixedPracticeModules: [],
      examIntegrity: {
        requireFullscreen: true,
        autoSubmitOnTabChange: true,
        blockRightClick: true,
        maxVisibilityLosses: 3,
        blockKeyboardShortcuts: true,
      },
      defaultModuleOptions: {
        timerDefault: 60 * 60 * 1000, // 60 minutes
        randomizeDefault: false,
      },
      userProfile: {},
      analytics: {
        enabled: true,
      },
      dailyLimit: {
        enabled: false,
        maxQuestionsPerDay: 50,
      },
      aiOrchestrator: {
        analysisVersion: 1,
        difficultyLevels: 12,
        autoDifficulty: false,
        autoModuleAssignment: {
          enabled: false,
          maxModulesPerQuestion: 2,
          learningRate: 0.35,
          respectManualRemovals: true,
          includeExistingUnassigned: false,
        },
      },
      semanticTuning: {
        enabled: false,
        updatedAt: Date.now(),
        tagThreshold: 0.3,
        siblingLambda: 0.35,
        upBeta: 0.55,
        downGamma: 0.18,
        targetAvgTags: 6,
      },
		semanticAutoApply: {
			enabled: false,
			updatedAt: Date.now(),
			applyTags: false,
			applyDifficulty: false,
			maxTags: 6,
			minScore: 0.35,
			preserveExistingQuestionTags: true,
			preserveExistingDifficulty: true,
		},
    };
    
    await db.settings.add(defaultSettings);
  } else if (!existingSettings.semanticTuning) {
    await db.settings.update('1', {
      semanticTuning: {
        enabled: false,
        updatedAt: Date.now(),
        tagThreshold: 0.3,
        siblingLambda: 0.35,
        upBeta: 0.55,
        downGamma: 0.18,
        targetAvgTags: 6,
      },
    });
	} else if (!existingSettings.semanticAutoApply) {
		await db.settings.update('1', {
			semanticAutoApply: {
				enabled: false,
				updatedAt: Date.now(),
				applyTags: false,
				applyDifficulty: false,
				maxTags: 6,
				minScore: 0.35,
				preserveExistingQuestionTags: true,
				preserveExistingDifficulty: true,
			},
		});
	} else if (!existingSettings.practiceTopicLocksByUserKey) {
		await db.settings.update('1', {
			practiceTopicLocksByUserKey: {},
		});
	} else if (!(existingSettings as any).practiceTopicHidden) {
		await db.settings.update('1', {
			practiceTopicHidden: {},
		});
	} else if (!(existingSettings as any).practiceTopicHiddenByUserKey) {
		await db.settings.update('1', {
			practiceTopicHiddenByUserKey: {},
		});
	} else if (!existingSettings.practiceHistory) {
		await db.settings.update('1', {
			practiceHistory: {
				recentQuestionIds: [],
				recentWordProblemCategories: [],
				updatedAt: Date.now(),
			},
		});
	} else if (typeof existingSettings.songRecognitionEnabled !== 'boolean') {
		await db.settings.update('1', {
			songRecognitionEnabled: false,
		});
  }
}
