import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import {
	Download,
	Upload,
	Trash2,
	Database,
	FileText,
	UserPlus,
	Users,
	Bug,
	HelpCircle,
	LayoutGrid,
	ClipboardList,
	Shield,
	Tag,
	CalendarDays,
	Music,
	BookText,
	Layers,
	BarChart3,
	Activity,
	Package,
	ScrollText,
	RefreshCw,
	Copy,
	Eye,
	EyeOff,
	Save,
	Settings as SettingsIcon,
} from 'lucide-react';
import { db, AppSettings, ErrorReport, initializeSettings, LyricsSourceEntry, User } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const settings = useLiveQuery(() => db.settings.get('1'), [], null as any);
  const users = useLiveQuery(() => db.users.toArray());
  const lyricsSourceCount = useLiveQuery(() => db.lyricsSource.count(), [], 0);
  const errorReports = useLiveQuery(
    () => db.errorReports.orderBy('createdAt').reverse().toArray(),
    [],
    [] as ErrorReport[]
  );
  const [activeErrorReport, setActiveErrorReport] = useState<ErrorReport | null>(null);
  const [errorReportFilter, setErrorReportFilter] = useState<'all' | 'new' | 'read' | 'fixed'>('all');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
  const [clearQuestions, setClearQuestions] = useState(false);
  const [clearModules, setClearModules] = useState(true);
  const [clearAttempts, setClearAttempts] = useState(true);
  const [clearIntegrityEvents, setClearIntegrityEvents] = useState(true);
  const [clearTags, setClearTags] = useState(true);
  const [pendingImport, setPendingImport] = useState<{
    rawData: any;
    newQuestions: any[];
    duplicateQuestions: any[];
    existingQuestionsSnapshot: any[];
  } | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const [lyricsImporting, setLyricsImporting] = useState(false);
  const [lyricsSourceWriterName, setLyricsSourceWriterName] = useState('');
  const [lyricsSourceReplaceExisting, setLyricsSourceReplaceExisting] = useState(false);
  const [lyricsSourceManageOpen, setLyricsSourceManageOpen] = useState(false);
  const [lyricsSourceManageSearch, setLyricsSourceManageSearch] = useState('');
  const [lyricsSourceWriterEdits, setLyricsSourceWriterEdits] = useState<Record<string, string>>({});

  const lyricsSourceEntries = useLiveQuery(async () => {
    try {
      return await db.lyricsSource.orderBy('normalizedEnglishTitle').toArray();
    } catch {
      return [] as LyricsSourceEntry[];
    }
  }, [], [] as LyricsSourceEntry[]);

  const filteredLyricsSourceEntries = useMemo(() => {
    const list = lyricsSourceEntries ?? [];
    const q = lyricsSourceManageSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => {
      const hay = `${e.englishTitle || ''} ${e.normalizedEnglishTitle || ''} ${e.writer || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [lyricsSourceEntries, lyricsSourceManageSearch]);

  const normalizeEnglishTitle = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const isNumericOnlyLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return /^[0-9০-৯]+$/.test(trimmed);
  };

  const handleImportLyricsSourceTxt = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    try {
      setLyricsImporting(true);
      const entries: LyricsSourceEntry[] = [];
      const now = Date.now();
      const writer = lyricsSourceWriterName.trim() || undefined;

      for (const file of files) {
        const text = await file.text();
        const blocks = text.split('* -');
        for (const rawBlock of blocks) {
          const block = rawBlock.replace(/^\s+|\s+$/g, '');
          if (!block) continue;

          const lines = block.split(/\r?\n/);
          let englishTitle = '';
          let normalizedEnglishTitle = '';
          const lyricsLines: string[] = [];

          for (const line of lines) {
            if (!englishTitle) {
              const parenMatch = line.match(/\(([^)]+)\)/);
              if (parenMatch && /[a-zA-Z]/.test(parenMatch[1] || '')) {
                englishTitle = String(parenMatch[1] || '').trim();
                normalizedEnglishTitle = normalizeEnglishTitle(englishTitle);
                continue;
              }
            }

            if (isNumericOnlyLine(line)) continue;
            if (!englishTitle && /[a-zA-Z]/.test(line) && /\(/.test(line) && /\)/.test(line)) continue;
            if (line.trim().length === 0) {
              lyricsLines.push('');
              continue;
            }
            if (!/[\u0980-\u09FF]/.test(line)) continue;

            lyricsLines.push(line.replace(/\r$/, ''));
          }

          if (!normalizedEnglishTitle) continue;
          const lyrics = lyricsLines.join('\n').replace(/\n+$/g, '');
          if (!lyrics.trim()) continue;

          entries.push({
            id: uuidv4(),
            englishTitle,
            normalizedEnglishTitle,
            lyrics,
            writer,
            createdAt: now,
          });
        }
      }

      const normalizedKeys = Array.from(new Set(entries.map((e) => e.normalizedEnglishTitle).filter(Boolean)));
      await db.transaction('rw', [db.lyricsSource], async () => {
        if (lyricsSourceReplaceExisting) {
          await db.lyricsSource.clear();
          if (entries.length) await db.lyricsSource.bulkPut(entries);
          return;
        }
        if (!entries.length) return;
        const existing = normalizedKeys.length
          ? await db.lyricsSource.where('normalizedEnglishTitle').anyOf(normalizedKeys).toArray()
          : ([] as LyricsSourceEntry[]);
        const existingByNorm = new Map(existing.map((e) => [e.normalizedEnglishTitle, e]));
        const merged = entries.map((e) => {
          const prev = existingByNorm.get(e.normalizedEnglishTitle);
          return prev ? { ...e, id: prev.id, createdAt: prev.createdAt } : e;
        });
        await db.lyricsSource.bulkPut(merged);
      });

      toast.success(
        `Imported lyrics source (${entries.length} songs from ${files.length} file${files.length === 1 ? '' : 's'})`,
      );
    } catch (e) {
      console.error(e);
      toast.error('Failed to import lyrics source');
    } finally {
      setLyricsImporting(false);
      event.target.value = '';
    }
  };

  // User management state
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
	const [revealedUserPasswords, setRevealedUserPasswords] = useState<Record<string, boolean>>({});

  const [questionPrompts, setQuestionPrompts] = useState<{ id: string; title: string; content: string }[]>([]);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<{ id: string; title: string; content: string } | null>(null);
  const [promptTitle, setPromptTitle] = useState('');
  const [promptContent, setPromptContent] = useState('');

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  useEffect(() => {
    const fromSettings = settings?.questionPrompts;
    if (Array.isArray(fromSettings)) {
      setQuestionPrompts(
        fromSettings
          .filter((p) => p && typeof (p as any).id === 'string')
          .map((p: any) => ({ id: String(p.id), title: String(p.title ?? ''), content: String(p.content ?? '') }))
      );
      return;
    }

    // Backward compatibility: migrate prompts from localStorage into IndexedDB once.
    try {
      const raw = window.localStorage.getItem('questionPrompts');
      if (!raw) {
        setQuestionPrompts([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setQuestionPrompts([]);
        return;
      }
      const migrated = parsed
        .filter((p) => p && typeof p.id === 'string')
        .map((p) => ({ id: String(p.id), title: String(p.title ?? ''), content: String(p.content ?? '') }));
      setQuestionPrompts(migrated);
      if (settings) {
        void db.settings.update('1', { questionPrompts: migrated });
      }
    } catch {
      setQuestionPrompts([]);
    }
  }, [settings]);

  const persistPrompts = (next: { id: string; title: string; content: string }[]) => {
    setQuestionPrompts(next);
    try {
      window.localStorage.setItem('questionPrompts', JSON.stringify(next));
    } catch {
    }
    void db.settings.update('1', { questionPrompts: next });
  };

  useEffect(() => {
    if (settings === undefined) return;
    if (!settings) {
      void initializeSettings();
    }
  }, [settings]);

  const handleUpdateSettings = async (updates: Partial<AppSettings>) => {
    if (!localSettings) return;
    
    const newSettings = { ...localSettings, ...updates };
    setLocalSettings(newSettings);
    
    try {
      await db.settings.update('1', updates);
      toast.success('Settings updated');
    } catch (error) {
      toast.error('Failed to update settings');
      console.error(error);
    }
  };

  const handleExportData = async () => {
    try {
      const questions = await db.questions.toArray();
      const tagFrequency = new Map<string, number>();
      for (const q of questions as any[]) {
        if (!Array.isArray(q.tags)) continue;
        for (const tag of q.tags) {
          if (typeof tag !== 'string') continue;
          tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1);
        }
      }

      const sortedTags = Array.from(tagFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name);
      const topTags = sortedTags.slice(0, 3);
      const sanitize = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      const tagsPart =
        topTags.length > 0
          ? topTags
              .map((t) => sanitize(t))
              .filter(Boolean)
              .join('_')
          : 'all-tags';

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const timestampPart = `${yyyy}${mm}${dd}-${hh}${min}`;

      const fileName = `MathInk-app-data-backup-${tagsPart}-${timestampPart}.json`;

      const yieldToUi = async () => {
        await new Promise<void>((r) => setTimeout(r, 0));
      };

      const readBlobBase64 = async (blob: Blob): Promise<string> => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Failed to read asset blob'));
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
      };

      const streamApi = window.data?.beginExportJson && window.data?.writeExportChunk && window.data?.finishExportJson;
      if (streamApi) {
        const beginRes = await window.data!.beginExportJson!({ defaultFileName: fileName });
        if (beginRes?.canceled || !beginRes.exportId) return;
        const exportId = beginRes.exportId;
        const write = async (chunk: string) => {
          await window.data!.writeExportChunk!({ exportId, chunk });
        };

        const writeArray = async (label: string, items: any[], transform?: (x: any, idx: number) => Promise<any>) => {
          await write(`\n  \"${label}\": [\n`);
          for (let i = 0; i < items.length; i++) {
            const v = transform ? await transform(items[i], i) : items[i];
            const json = JSON.stringify(v);
            await write(`    ${json}${i === items.length - 1 ? '' : ','}\n`);
            if (i % 10 === 0) await yieldToUi();
          }
          await write('  ]');
        };

        await write('{');
        await writeArray('questions', questions);

        const modules = await db.modules.toArray();
        await write(',');
        await writeArray('modules', modules);

        const attempts = await db.attempts.toArray();
        await write(',');
        await writeArray('attempts', attempts);

        const tags = await db.tags.toArray();
        await write(',');
        await writeArray('tags', tags);

        const settingsArray = await db.settings.toArray();
        await write(',');
        await writeArray('settings', settingsArray);

        const integrityEvents = await db.integrityEvents.toArray();
        await write(',');
        await writeArray('integrityEvents', integrityEvents);

        const dailyStats = await db.dailyStats.toArray();
        await write(',');
        await writeArray('dailyStats', dailyStats);

        const users = await db.users.toArray();
        await write(',');
        await writeArray('users', users);

        const globalGlossary = await db.globalGlossary.toArray();
        await write(',');
        await writeArray('globalGlossary', globalGlossary);

        const intelligenceSignals = await db.intelligenceSignals.toArray();
        await write(',');
        await writeArray('intelligenceSignals', intelligenceSignals);

        const errorReports = await db.errorReports.toArray();
        await write(',');
        await writeArray('errorReports', errorReports);

        const songsRaw = await db.songs.toArray();
        await write(',');
        await writeArray('songs', songsRaw, async (s: any) => {
          const audioFilePath = (s as any).audioFilePath as string;
          const audioFileUrl = (s as any).audioFileUrl as string;
          if (window.songs?.readAudioFile && audioFilePath && audioFileUrl && audioFileUrl.startsWith('file:')) {
            try {
              const res = await window.songs.readAudioFile({ filePath: audioFilePath });
              return { ...s, audioDataBase64: res.dataBase64 };
            } catch {
              return s;
            }
          }
          if (typeof audioFileUrl === 'string' && audioFileUrl.startsWith('data:')) {
            return { ...s, audioDataUrl: audioFileUrl };
          }
          return s;
        });

        const songModules = await db.songModules.toArray();
        await write(',');
        await writeArray('songModules', songModules);

        const lyricsSource = await db.lyricsSource.toArray();
        await write(',');
        await writeArray('lyricsSource', lyricsSource);

        const binaryAssetsRaw = await db.binaryAssets.toArray();
        await write(',');
        await writeArray('binaryAssets', binaryAssetsRaw, async (a: any) => {
          try {
            const blob = (a as any).data as Blob;
            if (blob && typeof blob.size === 'number' && blob.size > 0) {
              const dataBase64 = await readBlobBase64(blob);
              return { ...a, dataBase64, data: undefined };
            }
            return { ...a, data: undefined };
          } catch {
            return { ...a, data: undefined };
          }
        });

        await write(',\n');
        await write(`  \"exportedAt\": ${JSON.stringify(new Date().toISOString())},\n`);
        await write('  \"schemaVersion\": 23\n');
        await write('}\n');

        await window.data!.finishExportJson!({ exportId });
        toast.success('Data exported successfully');
        return;
      }

      const modules = await db.modules.toArray();
      const attempts = await db.attempts.toArray();
      const tags = await db.tags.toArray();
      const settingsArray = await db.settings.toArray();
      const integrityEvents = await db.integrityEvents.toArray();
      const dailyStats = await db.dailyStats.toArray();
      const users = await db.users.toArray();
      const globalGlossary = await db.globalGlossary.toArray();
      const intelligenceSignals = await db.intelligenceSignals.toArray();
      const errorReports = await db.errorReports.toArray();
      const songsRaw = await db.songs.toArray();
      const songModules = await db.songModules.toArray();
      const lyricsSource = await db.lyricsSource.toArray();
      const binaryAssetsRaw = await db.binaryAssets.toArray();

      const songs = [] as any[];
      for (let i = 0; i < songsRaw.length; i++) {
        const s: any = songsRaw[i];
        const audioFilePath = (s as any).audioFilePath as string;
        const audioFileUrl = (s as any).audioFileUrl as string;
        if (window.songs?.readAudioFile && audioFilePath && audioFileUrl && audioFileUrl.startsWith('file:')) {
          try {
            const res = await window.songs.readAudioFile({ filePath: audioFilePath });
            songs.push({ ...s, audioDataBase64: res.dataBase64 });
          } catch {
            songs.push(s);
          }
        } else if (typeof audioFileUrl === 'string' && audioFileUrl.startsWith('data:')) {
          songs.push({ ...s, audioDataUrl: audioFileUrl });
        } else {
          songs.push(s);
        }
        if (i % 10 === 0) await yieldToUi();
      }

      const binaryAssets = [] as any[];
      for (let i = 0; i < binaryAssetsRaw.length; i++) {
        const a: any = binaryAssetsRaw[i];
        try {
          const blob = (a as any).data as Blob;
          const dataBase64 = blob ? await readBlobBase64(blob) : '';
          binaryAssets.push({ ...a, dataBase64, data: undefined });
        } catch {
          binaryAssets.push({ ...a, data: undefined });
        }
        if (i % 10 === 0) await yieldToUi();
      }

      const data = {
        questions,
        modules,
        attempts,
        tags,
        settings: settingsArray,
        integrityEvents,
        dailyStats,
        users,
        globalGlossary,
        intelligenceSignals,
        errorReports,
        songs,
        songModules,
        lyricsSource,
        binaryAssets,
        exportedAt: new Date().toISOString(),
        schemaVersion: 23,
      };

      const dataText = JSON.stringify(data, null, 2);
      if (window.data?.exportJsonToFile) {
        const res = await window.data.exportJsonToFile({ defaultFileName: fileName, dataText });
        if (res?.canceled) {
          return;
        }
      } else {
        const blob = new Blob([dataText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }

      toast.success('Data exported successfully');
    } catch (error) {
      toast.error('Failed to export data');
      console.error(error);
    }
  };

  const handleExportQuestionsOnly = async () => {
    try {
      const questions = await db.questions.toArray();
      const data = {
        questions,
        exportedAt: new Date().toISOString(),
        kind: 'questions_only',
        schemaVersion: 22,
      };
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const timestampPart = `${yyyy}${mm}${dd}-${hh}${min}`;
      const fileName = `MathInk-questions-only-${timestampPart}.json`;
      const dataText = JSON.stringify(data, null, 2);
      if (window.data?.exportJsonToFile) {
        const res = await window.data.exportJsonToFile({ defaultFileName: fileName, dataText });
        if (res?.canceled) return;
      } else {
        const blob = new Blob([dataText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success('Questions exported successfully');
    } catch (error) {
      toast.error('Failed to export questions');
      console.error(error);
    }
  };

  const handleExportModulesWithQuestions = async () => {
    try {
      const modules = await db.modules.toArray();
      const moduleQuestionIds = new Set<string>();
      for (const m of modules as any[]) {
        const ids = Array.isArray((m as any).questionIds) ? ((m as any).questionIds as any[]) : [];
        for (const id of ids) {
          if (typeof id === 'string' && id) moduleQuestionIds.add(id);
        }
      }
      const questions = (await db.questions.bulkGet(Array.from(moduleQuestionIds))).filter(Boolean);
      const tags = await db.tags.toArray();

      const data = {
        modules,
        questions,
        tags,
        exportedAt: new Date().toISOString(),
        kind: 'modules_with_questions',
        schemaVersion: 23,
      };

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const timestampPart = `${yyyy}${mm}${dd}-${hh}${min}`;
      const fileName = `MathInk-modules-with-questions-${timestampPart}.json`;

      const dataText = JSON.stringify(data, null, 2);
      if (window.data?.exportJsonToFile) {
        const res = await window.data.exportJsonToFile({ defaultFileName: fileName, dataText });
        if (res?.canceled) return;
      } else {
        const blob = new Blob([dataText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }

      toast.success('Modules exported successfully');
    } catch (error) {
      toast.error('Failed to export modules');
      console.error(error);
    }
  };

  const questionsStructurallyMatch = (a: any, b: any): boolean => {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;

    const norm = (v: string | undefined | null) =>
      (v ?? '').toString().trim().replace(/\s+/g, ' ').toLowerCase();

    if (norm(a.text) !== norm(b.text)) return false;

    // MCQ: compare option texts and correct answers (by text)
    if (a.type === 'mcq') {
      const optsA = Array.isArray(a.options) ? a.options : [];
      const optsB = Array.isArray(b.options) ? b.options : [];
      if (optsA.length !== optsB.length) return false;
      const textsA = optsA.map((o: any) => norm(o.text));
      const textsB = optsB.map((o: any) => norm(o.text));
      if (textsA.some((t, idx) => t !== textsB[idx])) return false;

      const corrA = Array.isArray(a.correctAnswers) ? a.correctAnswers.map((id: any, idx: number) => norm(optsA[idx]?.text)) : [];
      const corrB = Array.isArray(b.correctAnswers) ? b.correctAnswers.map((id: any, idx: number) => norm(optsB[idx]?.text)) : [];
      if (corrA.length !== corrB.length) return false;
      const setA = new Set(corrA);
      const setB = new Set(corrB);
      if (setA.size !== setB.size) return false;
      for (const v of setA) {
        if (!setB.has(v)) return false;
      }
    }

    // Text questions: compare acceptable answers
    if (a.type === 'text') {
      const corrA = Array.isArray(a.correctAnswers) ? a.correctAnswers.map((c: any) => norm(c)) : [];
      const corrB = Array.isArray(b.correctAnswers) ? b.correctAnswers.map((c: any) => norm(c)) : [];
      if (corrA.length !== corrB.length) return false;
      const setA = new Set(corrA);
      const setB = new Set(corrB);
      if (setA.size !== setB.size) return false;
      for (const v of setA) {
        if (!setB.has(v)) return false;
      }
    }

    // Fill in the blanks: compare metadata blanks
    if (a.type === 'fill_blanks') {
      const blanksA = a.fillBlanks?.blanks ?? [];
      const blanksB = b.fillBlanks?.blanks ?? [];
      if (blanksA.length !== blanksB.length) return false;
      for (let i = 0; i < blanksA.length; i++) {
        if (norm(blanksA[i].correct) !== norm(blanksB[i].correct)) return false;
      }
    }

    // Matching: compare pairs' left/right text
    if (a.type === 'matching') {
      const pairsA = a.matching?.pairs ?? [];
      const pairsB = b.matching?.pairs ?? [];
      if (pairsA.length !== pairsB.length) return false;
      for (let i = 0; i < pairsA.length; i++) {
        if (norm(pairsA[i].leftText) !== norm(pairsB[i].leftText)) return false;
        if (norm(pairsA[i].rightText) !== norm(pairsB[i].rightText)) return false;
      }
    }

    // Explanation comparison (if present)
    if (norm(a.explanation) !== norm(b.explanation)) return false;

    return true;
  };

  const performImportWithStrategy = async (keepDuplicateQuestions: boolean, importData?: typeof pendingImport) => {
    const dataToImport = importData || pendingImport;
    if (!dataToImport) return;
    const { rawData, newQuestions, duplicateQuestions, existingQuestionsSnapshot } = dataToImport;

    try {
      await db.transaction(
        'rw',
        [
          db.questions,
          db.modules,
          db.attempts,
          db.tags,
          db.settings,
          db.integrityEvents,
          db.dailyStats,
          db.users,
          db.globalGlossary,
          db.intelligenceSignals,
          db.errorReports,
          db.lyricsSource,
        ],
        async () => {
          const existingCodes = new Set<string>();
          const existingIds = new Set<string>();
          for (const q of existingQuestionsSnapshot as any[]) {
            if (q.code) existingCodes.add(String(q.code));
            if (q.id) existingIds.add(String(q.id));
          }

          const questionsToImport: any[] = [...newQuestions];

          if (keepDuplicateQuestions) {
            for (const q of duplicateQuestions) {
              const clone = { ...q };
              // Ensure unique id and code so we keep both copies
              let newId = uuidv4();
              while (existingIds.has(newId)) {
                newId = uuidv4();
              }
              clone.id = newId;
              existingIds.add(newId);

              let newCode = `Q-${newId.slice(0, 8)}`;
              while (existingCodes.has(newCode)) {
                const extra = uuidv4().slice(0, 4);
                newCode = `Q-${newId.slice(0, 4)}${extra}`;
              }
              clone.code = newCode;
              existingCodes.add(newCode);

              questionsToImport.push(clone);
            }
          }

          if (questionsToImport.length > 0) {
            await db.questions.bulkPut(questionsToImport);
          }

          if (Array.isArray(rawData.modules) && rawData.modules.length > 0) {
            await db.modules.bulkPut(rawData.modules);
          }
          if (Array.isArray(rawData.attempts) && rawData.attempts.length > 0) {
            await db.attempts.bulkPut(rawData.attempts);
          }
          if (Array.isArray(rawData.tags) && rawData.tags.length > 0) {
            await db.tags.bulkPut(rawData.tags);
          }
          if (Array.isArray(rawData.settings) && rawData.settings.length > 0) {
            await db.settings.put(rawData.settings[0]);
          }
          if (Array.isArray(rawData.integrityEvents) && rawData.integrityEvents.length > 0) {
            await db.integrityEvents.bulkPut(rawData.integrityEvents);
          }
          if (Array.isArray(rawData.dailyStats) && rawData.dailyStats.length > 0) {
            await db.dailyStats.bulkPut(rawData.dailyStats);
          }
          if (Array.isArray(rawData.users) && rawData.users.length > 0) {
            await db.users.bulkPut(rawData.users);
          }
          if (Array.isArray(rawData.globalGlossary) && rawData.globalGlossary.length > 0) {
            await db.globalGlossary.bulkPut(rawData.globalGlossary);
          }
          if (Array.isArray(rawData.intelligenceSignals) && rawData.intelligenceSignals.length > 0) {
            await db.intelligenceSignals.bulkPut(rawData.intelligenceSignals);
          }
          if (Array.isArray(rawData.errorReports) && rawData.errorReports.length > 0) {
            await db.errorReports.bulkPut(rawData.errorReports);
          }
          if (Array.isArray(rawData.songs) && rawData.songs.length > 0) {
            const mappedSongs = await Promise.all(
              rawData.songs.map(async (s: any) => {
                const now = Date.now();
                const fileName = typeof s?.title === 'string' && s.title.trim() ? `${s.title}.audio` : 'song.audio';

                // If audio bytes exist in backup, reconstruct to a real file (Electron) or data URL (browser).
                if (typeof s?.audioDataBase64 === 'string' && s.audioDataBase64.length > 0) {
                  if (window.songs?.saveAudioFile) {
                    try {
                      const saved = await window.songs.saveAudioFile({ fileName, dataBase64: s.audioDataBase64 });
                      return {
                        ...s,
                        audioFilePath: saved.filePath,
                        audioFileUrl: saved.fileUrl,
                        updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : now,
                      };
                    } catch {
                      return {
                        ...s,
                        audioFilePath: '',
                        audioFileUrl: `data:audio/*;base64,${s.audioDataBase64}`,
                        updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : now,
                      };
                    }
                  }
                  return {
                    ...s,
                    audioFilePath: '',
                    audioFileUrl: `data:audio/*;base64,${s.audioDataBase64}`,
                    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : now,
                  };
                }

                if (typeof s?.audioDataUrl === 'string' && s.audioDataUrl.startsWith('data:')) {
                  return {
                    ...s,
                    audioFilePath: '',
                    audioFileUrl: s.audioDataUrl,
                    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : now,
                  };
                }

                return s;
              }),
            );
            await db.songs.bulkPut(mappedSongs);
          }
          if (Array.isArray(rawData.songModules) && rawData.songModules.length > 0) {
            await db.songModules.bulkPut(rawData.songModules);
          }
          if (Array.isArray(rawData.lyricsSource) && rawData.lyricsSource.length > 0) {
            await db.lyricsSource.bulkPut(rawData.lyricsSource);
          }
        }
      );

      toast.success('Data imported successfully');
      setPendingImport(null);
      setImportDialogOpen(false);
      window.location.reload();
    } catch (error) {
      toast.error('Failed to import data');
      console.error(error);
    }
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate minimal structure for supported import types
      // - Full backup: includes questions + modules (+ tags etc)
      // - Questions export: includes questions
      // - Modules export: includes modules + questions (and optionally tags)
      const kind = typeof data?.kind === 'string' ? data.kind : undefined;
      const hasQuestions = Array.isArray(data?.questions);
      const hasModules = Array.isArray(data?.modules);
      if (!hasQuestions && !hasModules) {
        throw new Error('Invalid import file format');
      }
      if (kind === 'modules_with_questions' && (!hasModules || !hasQuestions)) {
        throw new Error('Invalid modules export format');
      }

      const existingQuestions = await db.questions.toArray();
      const importedQuestions: any[] = Array.isArray(data.questions) ? data.questions : [];

      const normalizedData = {
        ...data,
        questions: importedQuestions,
        modules: Array.isArray(data.modules) ? data.modules : [],
        tags: Array.isArray(data.tags) ? data.tags : [],
      };

      const newQuestions: any[] = [];
      const duplicateQuestions: any[] = [];

      for (const imported of importedQuestions) {
        const match = (existingQuestions as any[]).find((q) => questionsStructurallyMatch(q, imported));
        if (match) {
          duplicateQuestions.push(imported);
        } else {
          newQuestions.push(imported);
        }
      }

      if (duplicateQuestions.length === 0) {
        // No conflicts; import everything directly without confirmation dialog
        const importData = {
          rawData: normalizedData,
          newQuestions: importedQuestions,
          duplicateQuestions: [],
          existingQuestionsSnapshot: existingQuestions,
        };
        setPendingImport(importData);
        await performImportWithStrategy(false, importData);
      } else {
        // Store pending import and show confirmation dialog
        setPendingImport({
          rawData: normalizedData,
          newQuestions,
          duplicateQuestions,
          existingQuestionsSnapshot: existingQuestions,
        });
        setImportDialogOpen(true);
      }
    } catch (error) {
      toast.error('Failed to import data');
      console.error(error);
    }

    // Reset input
    event.target.value = '';
  };

  const handleClearAllData = async () => {
    try {
      if (!clearQuestions && !clearModules && !clearAttempts && !clearIntegrityEvents && !clearTags) {
        toast.error('Please select at least one data type to clear.');
        return;
      }

      const tables: any[] = [];
      if (clearQuestions) tables.push(db.questions);
      if (clearModules) tables.push(db.modules);
      if (clearAttempts) tables.push(db.attempts);
      if (clearIntegrityEvents) tables.push(db.integrityEvents);
      if (clearTags) tables.push(db.tags);

      await db.transaction('rw', tables, async () => {
        if (clearQuestions) await db.questions.clear();
        if (clearModules) await db.modules.clear();
        if (clearAttempts) await db.attempts.clear();
        if (clearIntegrityEvents) await db.integrityEvents.clear();
        if (clearTags) await db.tags.clear();
      });

      toast.success('Selected data cleared');
      setShowClearDialog(false);
      window.location.reload();
    } catch (error) {
      toast.error('Failed to clear data');
      console.error(error);
    }
  };

  if (!localSettings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  const handleCreateUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      toast.error('Please enter both username and password');
      return;
    }

    // Check if username already exists
    const existing = await db.users.where('username').equals(newUsername.trim()).first();
    if (existing) {
      toast.error('Username already exists');
      return;
    }

    try {
      const newUser: User = {
        id: uuidv4(),
        username: newUsername.trim(),
        password: newPassword.trim(),
        createdAt: Date.now(),
      };
      await db.users.add(newUser);
      toast.success('User created successfully');
      setNewUsername('');
      setNewPassword('');
      setShowUserDialog(false);
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Failed to create user');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    try {
      await db.users.delete(deleteUserId);
      toast.success('User deleted successfully');
      setDeleteUserId(null);
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    }
  };

  const handleStartEditUser = (user: User) => {
    setEditingUser(user);
    setEditUsername(user.username);
    setEditPassword(user.password ?? '');
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    if (!editUsername.trim() || !editPassword.trim()) {
      toast.error('Please enter both username and password');
      return;
    }

    try {
      const updatedUser: User = {
        ...editingUser,
        username: editUsername.trim(),
        password: editPassword.trim(),
      };
      await db.users.put(updatedUser);
      toast.success('User updated successfully');
      setEditingUser(null);
      setEditUsername('');
      setEditPassword('');
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Failed to update user');
    }
  };

	const toggleRevealUserPassword = (userId: string) => {
		setRevealedUserPasswords((prev) => ({ ...prev, [userId]: !prev[userId] }));
	};

	const handleCopyUserPassword = async (password: string | undefined | null) => {
		const value = String(password ?? '');
		if (!value) {
			toast.error('No password to copy');
			return;
		}
		try {
			await navigator.clipboard.writeText(value);
			toast.success('Password copied');
		} catch {
			toast.error('Failed to copy password');
		}
	};

  return (
    <TooltipProvider>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure your application preferences and exam integrity features
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-foreground">Quick access</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isAdmin ? (
              <Card className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-semibold text-foreground">Practice Admin</h2>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Frequency controls, topic locks, and mixed modules.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Button onClick={() => navigate('/settings/practice-admin')}>
                      Open
                    </Button>
                  </div>
                </div>
              </Card>

            ) : null}

            {isAdmin ? (
              <Card className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <BookText className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-semibold text-foreground">Custom Dictionary</h2>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Manage Bengali/English word meanings for click-to-lookup across the app.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Button onClick={() => navigate('/settings/custom-dictionary')}>Open</Button>
                  </div>
                </div>
              </Card>
            ) : null}

            <Card className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Music className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold text-foreground">Songs</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enable or disable song recognition features for students.
                  </p>
                </div>
                <div className="shrink-0 flex flex-wrap items-center justify-end gap-3">
                  <Label className="text-sm whitespace-nowrap">Song recognition</Label>
                  <Switch
                    checked={localSettings.songRecognitionEnabled === true}
                    onCheckedChange={(v) => void handleUpdateSettings({ songRecognitionEnabled: v === true })}
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* User Management */}
        <Card className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-foreground">User Management</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Create and manage student accounts
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => setShowUserDialog(true)} className="whitespace-nowrap">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create User
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create a new student account</TooltipContent>
            </Tooltip>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="text-sm font-semibold">Student Users</div>
            {users && users.length > 0 ? (
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-md border bg-background"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{user.username}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        Student
                      </Badge>
                      <span className="hidden sm:inline-flex items-center gap-2 ml-2 text-xs text-muted-foreground">
                        <span className="rounded-full border bg-muted/30 px-2 py-0.5 font-mono">
                          {revealedUserPasswords[user.id] ? String(user.password ?? '') : '••••••••'}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              aria-label={revealedUserPasswords[user.id] ? 'Hide password' : 'Show password'}
                              onClick={() => toggleRevealUserPassword(user.id)}
                            >
                              {revealedUserPasswords[user.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{revealedUserPasswords[user.id] ? 'Hide password' : 'Show password'}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              aria-label="Copy password"
                              onClick={() => void handleCopyUserPassword(user.password)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy password</TooltipContent>
                        </Tooltip>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartEditUser(user)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteUserId(user.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No users created yet</p>
            )}
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Question Prompts</h2>
              <p className="text-sm text-muted-foreground mt-1">Create reusable prompts you can insert while writing questions.</p>
            </div>
            <Button
              onClick={() => {
                setEditingPrompt(null);
                setPromptTitle('');
                setPromptContent('');
                setPromptDialogOpen(true);
              }}
            >
              Add Prompt
            </Button>
          </div>

          <div className="space-y-2">
            {questionPrompts.length === 0 ? (
              <div className="text-sm text-muted-foreground">No prompts yet.</div>
            ) : (
              <div className="space-y-2">
                {questionPrompts.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-3 rounded-md border bg-background p-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{p.title || 'Untitled prompt'}</div>
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{p.content}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingPrompt(p);
                          setPromptTitle(p.title);
                          setPromptContent(p.content);
                          setPromptDialogOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          const next = questionPrompts.filter((x) => x.id !== p.id);
                          persistPrompts(next);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingPrompt ? 'Edit Prompt' : 'Add Prompt'}</DialogTitle>
                <DialogDescription>These prompts are stored locally on this device.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Title</Label>
                  <Input value={promptTitle} onChange={(e) => setPromptTitle(e.target.value)} placeholder="e.g. Solve using integration" />
                </div>
                <div className="space-y-1">
                  <Label>Prompt</Label>
                  <textarea
                    className="w-full min-h-[160px] rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={promptContent}
                    onChange={(e) => setPromptContent(e.target.value)}
                    placeholder="Write the reusable prompt text here..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPromptDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const title = promptTitle.trim();
                    const content = promptContent;
                    if (!content.trim()) {
                      toast.error('Prompt cannot be empty');
                      return;
                    }
                    if (editingPrompt) {
                      const next = questionPrompts.map((p) => (p.id === editingPrompt.id ? { ...p, title, content } : p));
                      persistPrompts(next);
                    } else {
                      const next = [{ id: uuidv4(), title, content }, ...questionPrompts];
                      persistPrompts(next);
                    }
                    setPromptDialogOpen(false);
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>



        {/* Error Reports */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Bug className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">Error Reports</h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Reports submitted by students with detailed descriptions and question/module metadata.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={errorReportFilter} onValueChange={(v: any) => setErrorReportFilter(v)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ScrollArea className="h-72 rounded-md border bg-background">
            <div className="divide-y">
              {(errorReports || [])
                .filter((r) => errorReportFilter === 'all' ? true : r.status === errorReportFilter)
                .map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="w-full text-left p-3 hover:bg-muted/60"
                    onClick={async () => {
                      setActiveErrorReport(r);
                      if (r.status === 'new') {
                        await db.errorReports.update(r.id, { status: 'read', updatedAt: Date.now() });
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={r.status === 'new' ? 'default' : r.status === 'fixed' ? 'secondary' : 'outline'} className="text-[10px] uppercase">
                            {r.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">
                            {new Date(r.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-foreground line-clamp-2">
                          {r.message}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {r.moduleTitle ? `Module: ${r.moduleTitle}` : 'Module: (unknown)'}
                          {r.questionCode ? ` · Question: ${r.questionCode}` : ''}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              {(!errorReports || errorReports.length === 0) && (
                <div className="p-6 text-sm text-muted-foreground text-center">No error reports yet.</div>
              )}
            </div>
          </ScrollArea>

          <Dialog
            open={!!activeErrorReport}
            onOpenChange={(open) => { if (!open) setActiveErrorReport(null); }}
          >
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Error Report</DialogTitle>
                <DialogDescription>
                  Review the report, then mark it as read or fixed.
                </DialogDescription>
              </DialogHeader>
              {activeErrorReport && (
				<ScrollArea className="max-h-[70vh] pr-3">
					<div className="space-y-4">
						{activeErrorReport.screenshotDataUrl && (
							<div className="rounded-md border p-3">
								<div className="text-xs text-muted-foreground">Screenshot</div>
								<div className="mt-2 max-h-[60vh] overflow-auto rounded-md border">
									<img
										src={activeErrorReport.screenshotDataUrl}
										alt="Error report screenshot"
										className="w-full h-auto"
									/>
								</div>
							</div>
						)}
						<div className="rounded-md border p-3">
							<div className="text-xs text-muted-foreground">Message</div>
							<div className="mt-1 text-sm text-foreground whitespace-pre-wrap">
								{activeErrorReport.message}
							</div>
						</div>
						<div className="rounded-md border p-3 text-sm">
							<div className="text-xs text-muted-foreground mb-2">Metadata</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
								<div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{activeErrorReport.status}</span></div>
								<div><span className="text-muted-foreground">Created:</span> <span className="font-medium">{new Date(activeErrorReport.createdAt).toLocaleString()}</span></div>
								<div><span className="text-muted-foreground">Module:</span> <span className="font-medium">{activeErrorReport.moduleTitle || activeErrorReport.moduleId || '—'}</span></div>
								<div><span className="text-muted-foreground">Question:</span> <span className="font-medium">{activeErrorReport.questionCode || activeErrorReport.questionId || '—'}</span></div>
								<div><span className="text-muted-foreground">Reporter:</span> <span className="font-medium">{activeErrorReport.reporterUsername || activeErrorReport.reporterUserId || '—'}</span></div>
								<div><span className="text-muted-foreground">Route:</span> <span className="font-medium">{activeErrorReport.route || '—'}</span></div>
							</div>
							{activeErrorReport.questionTags && activeErrorReport.questionTags.length > 0 && (
								<div className="mt-3">
									<div className="text-xs text-muted-foreground mb-1">Tags</div>
									<div className="flex flex-wrap gap-1">
										{activeErrorReport.questionTags.map((t) => (
											<Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				</ScrollArea>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveErrorReport(null)}
                >
                  Close
                </Button>
                {activeErrorReport && activeErrorReport.status !== 'fixed' && (
                  <Button
                    type="button"
                    onClick={async () => {
                      await db.errorReports.update(activeErrorReport.id, { status: 'fixed', updatedAt: Date.now() });
                      setActiveErrorReport((prev) => prev ? { ...prev, status: 'fixed', updatedAt: Date.now() } : prev);
                    }}
                  >
                    Mark fixed
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>

      {/* Import Conflict Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        setImportDialogOpen(open);
        if (!open) {
          setPendingImport(null);
        }
      }}>
        <DialogContent className="w-[96vw] max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import Questions</DialogTitle>
            <DialogDescription>
              We found existing questions that closely match questions in the imported file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              <strong>Total questions in file:</strong>{' '}
              {pendingImport ? pendingImport.newQuestions.length + pendingImport.duplicateQuestions.length : 0}
            </p>
            <p>
              <strong>New questions to be added:</strong>{' '}
              {pendingImport ? pendingImport.newQuestions.length : 0}
            </p>
            <p>
              <strong>Matching questions detected:</strong>{' '}
              {pendingImport ? pendingImport.duplicateQuestions.length : 0}
            </p>
            <p className="text-muted-foreground">
              Existing questions in your bank will never be removed. For the matching questions from the
              file, choose whether to skip them or keep separate copies with new question codes.
            </p>
          </div>
          <DialogFooter className="flex flex-col gap-4 sm:gap-3">
            <div className="w-full rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
              <span>Import strategy for matching questions:</span>
              <span>• <strong>Skip</strong>: only new questions are imported.</span>
              <span>• <strong>Keep with new codes</strong>: duplicates are imported as separate questions.</span>
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:items-center sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setPendingImport(null);
                  setImportDialogOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await performImportWithStrategy(false);
                }}
              >
                Import &amp; Skip Matches
              </Button>
              <Button
                onClick={async () => {
                  await performImportWithStrategy(true);
                }}
              >
                Import &amp; Keep with New Codes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Data Management */}
      <Card className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Data Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Export, import, or clear your application data
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button onClick={handleExportData} variant="outline" className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>

					<Button onClick={handleExportQuestionsOnly} variant="outline" className="w-full">
						<FileText className="h-4 w-4 mr-2" />
						Export Questions Only
					</Button>

          <Button onClick={handleExportModulesWithQuestions} variant="outline" className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Export Modules (with Questions)
          </Button>

          <div className="relative">
            <Input
              type="file"
              accept=".json"
              onChange={handleImportData}
              className="absolute inset-0 opacity-0 cursor-pointer"
              id="import-file"
            />
            <Button variant="outline" className="w-full pointer-events-none">
              <Upload className="h-4 w-4 mr-2" />
              Import Data
            </Button>
          </div>
        </div>

			<Separator />

			<div className="rounded-xl border bg-muted/10 p-4 md:p-5 space-y-4">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div>
						<div className="text-base font-semibold">Song Lyrics Source</div>
						<div className="text-sm text-muted-foreground">Imported entries: {lyricsSourceCount ?? 0}</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							disabled={(lyricsSourceCount ?? 0) === 0}
							onClick={() => {
								setLyricsSourceManageSearch('');
								setLyricsSourceWriterEdits({});
								setLyricsSourceManageOpen(true);
							}}
						>
							Edit Writers
						</Button>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
					<div className="lg:col-span-6 space-y-2">
						<Label>Writer name (optional)</Label>
						<Input
							value={lyricsSourceWriterName}
							onChange={(e) => setLyricsSourceWriterName(e.target.value)}
							placeholder="e.g. Rabindranath Tagore"
							disabled={lyricsImporting}
						/>
						<div className="text-xs text-muted-foreground">
							Saved on each imported entry and can be applied to songs later.
						</div>
					</div>
					<div className="lg:col-span-6 space-y-2">
						<Label>Apply writer to existing imported lyrics</Label>
						<Button
							variant="outline"
							className="w-full"
							disabled={lyricsImporting || (lyricsSourceCount ?? 0) === 0}
							onClick={async () => {
								const writer = lyricsSourceWriterName.trim();
								try {
									if (!writer) {
										toast.error('Please enter a writer name first');
										return;
									}
									await db.lyricsSource.toCollection().modify((entry) => {
										(entry as any).writer = writer;
									});
									toast.success('Writer name updated for imported lyrics');
								} catch (e) {
									console.error(e);
									toast.error('Failed to update writer name');
								}
							}}
						>
							Apply Writer
						</Button>
						<div className="text-xs text-muted-foreground">
							Useful if you imported the file before setting a writer name.
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
					<div className="lg:col-span-8">
						<div className="relative">
							<Input
								type="file"
								accept=".txt"
								multiple
								onChange={handleImportLyricsSourceTxt}
								className="absolute inset-0 opacity-0 cursor-pointer"
								disabled={lyricsImporting}
								id="import-lyrics-source"
							/>
							<Button variant="outline" className="w-full pointer-events-none" disabled={lyricsImporting}>
								<Upload className="h-4 w-4 mr-2" />
								{lyricsImporting ? 'Importing lyrics...' : 'Import Lyrics (.txt)'}
							</Button>
						</div>
						<label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
							<Checkbox
								checked={lyricsSourceReplaceExisting}
								onCheckedChange={(v) => setLyricsSourceReplaceExisting(v === true)}
							/>
							<span>Replace existing imported lyrics</span>
						</label>
					</div>
					<div className="lg:col-span-4">
						<Button
							variant="outline"
							className="w-full"
							disabled={lyricsImporting || (lyricsSourceCount ?? 0) === 0}
							onClick={async () => {
								try {
									await db.lyricsSource.clear();
									toast.success('Cleared lyrics source');
								} catch (e) {
									console.error(e);
									toast.error('Failed to clear lyrics source');
								}
							}}
						>
							Clear Lyrics Source
						</Button>
						<div className="text-xs text-muted-foreground mt-2">
							Clears only the imported lyrics library, not song lyrics already stored on songs.
						</div>
					</div>
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between gap-3">
						<div className="text-sm font-medium">Imported .txt entries</div>
						<div className="text-xs text-muted-foreground">Showing {filteredLyricsSourceEntries.length} of {lyricsSourceEntries.length}</div>
					</div>
					<Input
						value={lyricsSourceManageSearch}
						onChange={(e) => setLyricsSourceManageSearch(e.target.value)}
						placeholder="Search imported titles or writers…"
						className="h-9"
						disabled={lyricsImporting}
					/>
					<ScrollArea className="h-[240px] rounded-md border bg-background/60">
						<div className="divide-y">
							{filteredLyricsSourceEntries.length ? (
								filteredLyricsSourceEntries.slice(0, 200).map((entry) => (
									<div key={entry.id} className="p-3">
										<Tooltip>
											<TooltipTrigger asChild>
												<div className="text-sm font-medium truncate">{entry.englishTitle}</div>
											</TooltipTrigger>
											<TooltipContent>{entry.englishTitle}</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<div className="text-xs text-muted-foreground truncate">Writer: {entry.writer || '—'}</div>
											</TooltipTrigger>
											<TooltipContent>{entry.writer || '—'}</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<div className="text-[11px] text-muted-foreground truncate">Key: {entry.normalizedEnglishTitle}</div>
											</TooltipTrigger>
											<TooltipContent>{entry.normalizedEnglishTitle}</TooltipContent>
										</Tooltip>
									</div>
								))
							) : (
								<div className="p-6 text-center text-sm text-muted-foreground">No entries found.</div>
							)}
						</div>
					</ScrollArea>
					<div className="text-xs text-muted-foreground">
						Tip: use “Edit Writers” for bulk editing, or search above to quickly verify what titles were imported.
					</div>
				</div>
			</div>

			<Dialog
				open={lyricsSourceManageOpen}
				onOpenChange={(open) => {
					setLyricsSourceManageOpen(open);
					if (!open) {
						setLyricsSourceManageSearch('');
						setLyricsSourceWriterEdits({});
					}
				}}
			>
				<DialogContent className="max-w-4xl">
					<DialogHeader>
						<DialogTitle>Edit lyrics writers</DialogTitle>
						<DialogDescription>Edit the writer name for each imported lyrics entry.</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<Input
								value={lyricsSourceManageSearch}
								onChange={(e) => setLyricsSourceManageSearch(e.target.value)}
								placeholder="Search by title or writer..."
							/>
						</div>
						<ScrollArea className="h-[60vh] rounded-md border">
							<div className="divide-y">
								{filteredLyricsSourceEntries.length ? (
									filteredLyricsSourceEntries.map((entry) => {
										const value =
											lyricsSourceWriterEdits[entry.id] ??
											(entry.writer ?? '');
										return (
											<div key={entry.id} className="p-3 grid grid-cols-12 gap-3 items-center">
												<div className="col-span-5 min-w-0">
													<Tooltip>
														<TooltipTrigger asChild>
															<div className="text-sm font-medium truncate">{entry.englishTitle}</div>
														</TooltipTrigger>
														<TooltipContent>{entry.englishTitle}</TooltipContent>
													</Tooltip>
													<Tooltip>
														<TooltipTrigger asChild>
															<div className="text-xs text-muted-foreground truncate">{entry.normalizedEnglishTitle}</div>
														</TooltipTrigger>
														<TooltipContent>{entry.normalizedEnglishTitle}</TooltipContent>
													</Tooltip>
												</div>
												<div className="col-span-5">
													<Input
														value={value}
														onChange={(e) =>
															setLyricsSourceWriterEdits((prev) => ({
																...prev,
																[entry.id]: e.target.value,
															}))
														}
														placeholder="Writer name"
													/>
												</div>
												<div className="col-span-2 flex justify-end">
													<Button
														size="sm"
														variant="outline"
														onClick={async () => {
															try {
																const next = (lyricsSourceWriterEdits[entry.id] ?? entry.writer ?? '').trim();
																await db.lyricsSource.update(entry.id, { writer: next || undefined });
																toast.success('Writer updated');
															} catch (e) {
																console.error(e);
																toast.error('Failed to update writer');
															}
														}}
													>
														Save
													</Button>
												</div>
											</div>
										);
									})
								) : (
									<div className="p-6 text-center text-sm text-muted-foreground">No entries found.</div>
								)}
							</div>
						</ScrollArea>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setLyricsSourceManageOpen(false)}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

        <Separator />

        <div>
          <Button
            variant="destructive"
            onClick={() => setShowClearDialog(true)}
            className="w-full"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All Data
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Warning: This will permanently delete all questions, modules, and attempts
          </p>
        </div>
      </Card>

      {/* Database Info */}
      <DatabaseInfo />

      {/* Database Explorer */}
      <DatabaseExplorer />

      {/* Create User Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Create a new student account. The student will be able to access the Home page with this username and password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="Enter username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateUser();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateUser();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser}>
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => {
        if (!open) {
          setEditingUser(null);
          setEditUsername('');
          setEditPassword('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update the student's username and password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                placeholder="Enter username"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleUpdateUser();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">Password</Label>
              <Input
                id="edit-password"
                type="password"
                placeholder="Enter password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleUpdateUser();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingUser(null);
                setEditUsername('');
                setEditPassword('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateUser}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={!!deleteUserId} onOpenChange={(open) => !open && setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Data Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Choose which data to clear below. Selected items will be permanently deleted from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={clearQuestions} onCheckedChange={(v) => setClearQuestions(v === true)} />
              <span>Questions</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={clearModules} onCheckedChange={(v) => setClearModules(v === true)} />
              <span>Modules</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={clearAttempts} onCheckedChange={(v) => setClearAttempts(v === true)} />
              <span>Attempts</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={clearIntegrityEvents} onCheckedChange={(v) => setClearIntegrityEvents(v === true)} />
              <span>Integrity events</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={clearTags} onCheckedChange={(v) => setClearTags(v === true)} />
              <span>Tags</span>
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAllData}>
              Delete Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </TooltipProvider>
);

}

function DatabaseInfo() {
  const [statsNonce, setStatsNonce] = useState(0);
  const [statsRefreshing, setStatsRefreshing] = useState(false);

  const questionStats = useLiveQuery(async () => {
    const qs = await db.questions.toArray();
    let total = qs.length;
    let mcq = 0;
    let text = 0;
    let fillBlanks = 0;
    let matching = 0;
    let wordCount = 0;

    const stripTags = (html: string | undefined | null): string =>
      (html ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const countWords = (text: string): number =>
      text ? text.split(/\s+/).filter(Boolean).length : 0;

    for (const q of qs as any[]) {
      if (q.type === 'mcq') mcq++;
      else if (q.type === 'text') text++;
      else if (q.type === 'fill_blanks') fillBlanks++;
      else if (q.type === 'matching') matching++;

      let combined = '';
      combined += ' ' + stripTags(q.text);
      combined += ' ' + stripTags(q.explanation);

      if (Array.isArray(q.options)) {
        for (const opt of q.options) {
          combined += ' ' + stripTags(opt?.text);
        }
      }

      if (q.matching && Array.isArray(q.matching.pairs)) {
        for (const pair of q.matching.pairs) {
          combined += ' ' + stripTags(pair?.leftText);
          combined += ' ' + stripTags(pair?.rightText);
        }
      }

      wordCount += countWords(combined);
    }

    return { total, mcq, text, fillBlanks, matching, wordCount };
  }, [statsNonce]);
  const moduleCount = useLiveQuery(() => db.modules.count(), [statsNonce]);
  const attemptCount = useLiveQuery(() => db.attempts.count(), [statsNonce]);
  const tagCount = useLiveQuery(() => db.tags.count(), [statsNonce]);

  return (
    <Card className="p-6 space-y-4 rounded-2xl border border-border/70 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Database Statistics</h2>
            <p className="text-sm text-muted-foreground mt-1">A quick overview of what’s stored locally on this device.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh stats"
            onClick={() => {
              setStatsNonce((n) => n + 1);
              setStatsRefreshing(true);
              window.setTimeout(() => setStatsRefreshing(false), 650);
            }}
            className={statsRefreshing ? 'scale-[1.03]' : ''}
          >
            <RefreshCw className={"h-4 w-4 " + (statsRefreshing ? 'animate-spin' : '')} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 rounded-xl border border-border/70 shadow-sm">
          <p className="text-sm text-muted-foreground">Questions</p>
          <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{questionStats?.total ?? 0}</p>
        </Card>
        <Card className="p-4 rounded-xl border border-border/70 shadow-sm">
          <p className="text-sm text-muted-foreground">Modules</p>
          <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{moduleCount || 0}</p>
        </Card>
        <Card className="p-4 rounded-xl border border-border/70 shadow-sm">
          <p className="text-sm text-muted-foreground">Attempts</p>
          <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{attemptCount || 0}</p>
        </Card>
        <Card className="p-4 rounded-xl border border-border/70 shadow-sm">
          <p className="text-sm text-muted-foreground">Tags</p>
          <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{tagCount || 0}</p>
        </Card>
      </div>

      {questionStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-border/60">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">MCQ</p>
            <p className="text-lg font-semibold text-foreground">{questionStats.mcq}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Text</p>
            <p className="text-lg font-semibold text-foreground">{questionStats.text}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Fill Blanks</p>
            <p className="text-lg font-semibold text-foreground">{questionStats.fillBlanks}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Matching</p>
            <p className="text-lg font-semibold text-foreground">{questionStats.matching}</p>
          </div>
        </div>
      )}

      {questionStats && (
        <div className="mt-3 flex items-center gap-2 p-3 bg-muted/60 rounded-xl border border-border/70">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Approximate total words in all questions, options, explanations and matching pairs:{' '}
            <span className="font-semibold text-foreground">
              {questionStats.wordCount.toLocaleString()}
            </span>
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 p-3 bg-muted/60 rounded-xl border border-border/70">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          All data is stored locally on your device using IndexedDB
        </p>
      </div>
    </Card>
  );
}

type ExplorerTableKey =
  | 'questions'
  | 'modules'
  | 'attempts'
  | 'integrityEvents'
  | 'tags'
  | 'dailyStats'
  | 'practiceEvents'
  | 'errorReports'
  | 'songs'
  | 'songModules'
  | 'songListeningEvents'
  | 'binaryAssets'
  | 'lyricsSource'
  | 'users'
  | 'settings';

function DatabaseExplorer() {
  const [activeTable, setActiveTable] = useState<ExplorerTableKey>('questions');
  const [search, setSearch] = useState('');
  const [recordLimit, setRecordLimit] = useState(200);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [editedJson, setEditedJson] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [explanation, setExplanation] = useState<string>('');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const safeJsonStringify = (value: any, space?: number) => {
    return JSON.stringify(
      value,
      (_key, v) => {
        if (typeof Blob !== 'undefined' && v instanceof Blob) {
          const mime = (v as Blob).type || 'application/octet-stream';
          return `[Blob ${mime} ${(v as Blob).size} bytes]`;
        }
        return v;
      },
      space,
    );
  };

  const records = useLiveQuery(async () => {
    const table = (db as any)[activeTable];
    if (!table) return [];

    // binaryAssets may contain large Blobs; avoid loading them in list view.
    if (activeTable === 'binaryAssets') {
      const keys = (await table.toCollection().limit(recordLimit).primaryKeys()) as any[];
      const rows = keys.map((id) => ({ id }));
      if (!search.trim()) return rows;
      const q = search.toLowerCase();
      return rows.filter((r) => String(r.id ?? '').toLowerCase().includes(q));
    }

    const all = await table.toCollection().limit(recordLimit).toArray();
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((row: any) => {
      try {
        return safeJsonStringify(row).toLowerCase().includes(q);
      } catch {
        return false;
      }
    });
  }, [activeTable, search, recordLimit, refreshNonce]) as any[] | undefined;

  const handleCopySelected = async () => {
    if (!selectedRecord) {
      toast.error('No record selected');
      return;
    }
    try {
      const text = safeJsonStringify(selectedRecord, 2);
      await navigator.clipboard.writeText(text);
      toast.success('Copied JSON');
    } catch (e) {
      console.error(e);
      toast.error('Failed to copy');
    }
  };

  const handleDownloadSelected = () => {
    if (!selectedRecord) {
      toast.error('No record selected');
      return;
    }
    try {
      const text = safeJsonStringify(selectedRecord, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const id = String(selectedRecord.id ?? selectedRecord.key ?? selectedRecord.primaryKey ?? 'record');
      a.href = url;
      a.download = `${String(activeTable)}-${id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error('Failed to download');
    }
  };

  const deleteSongCascade = useCallback(async (songId: string) => {
    const song = await db.songs.get(songId);
    const audioFilePath = (song as any)?.audioFilePath as string | undefined;
    const audioFileUrl = (song as any)?.audioFileUrl as string | undefined;
    const audioAssetId = (song as any)?.audioAssetId as string | undefined;

    // Delete on-disk audio file first (Electron) so we don't orphan files even if DB delete later succeeds.
    if (window.songs?.deleteAudioFile && audioFilePath && typeof audioFileUrl === 'string' && audioFileUrl.startsWith('file:')) {
      try {
        await window.songs.deleteAudioFile({ filePath: audioFilePath });
      } catch {
        // ignore
      }
    }

    await db.transaction('rw', [db.songs, db.songSrtCues, db.songListeningEvents, db.songModules, db.binaryAssets], async () => {
      await db.songSrtCues.where('songId').equals(songId).delete();
      await db.songListeningEvents.where('songId').equals(songId).delete();

      // Remove from any song modules that reference this song.
      const mods = await db.songModules.toArray();
      const affected = mods.filter((m) => Array.isArray(m.songIds) && m.songIds.includes(songId));
      for (const m of affected) {
        await db.songModules.update(m.id, {
          songIds: (m.songIds || []).filter((id) => id !== songId),
          updatedAt: Date.now(),
        });
      }

      if (audioAssetId) {
        try {
          await db.binaryAssets.delete(audioAssetId);
        } catch {
          // ignore
        }
      }
      await db.songs.delete(songId);
    });
  }, []);

  const handleBulkDeleteVisible = async () => {
    if (activeTable === 'settings') {
      toast.error('Settings cannot be bulk deleted. Update the settings record instead.');
      return;
    }
    if (!records || records.length === 0) {
      toast.error('No records to delete for this table/search.');
      return;
    }
    const table = (db as any)[activeTable];
    if (!table) return;
    // Only operate on rows that expose a primary key (id/key/primaryKey)
    const keys = records
      .map((row: any) => row.id ?? row.key ?? row.primaryKey)
      .filter((k: unknown) => k !== undefined && k !== null);
    if (!keys.length) {
      toast.error('Visible records do not expose a deletable primary key.');
      return;
    }
    try {
      setIsBulkDeleting(true);
      if (activeTable === 'songs') {
        for (const k of keys) {
          await deleteSongCascade(String(k));
        }
      } else {
        await table.bulkDelete(keys as any[]);
      }
      toast.success(`Deleted ${keys.length} record${keys.length === 1 ? '' : 's'} from ${tableLabel}.`);
      setSelectedRecord(null);
      setEditedJson('');
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to bulk delete visible records.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleSelect = (row: any) => {
    setSelectedRecord(row);
    setExplanation('');
    try {
      setEditedJson(safeJsonStringify(row, 2));
    } catch {
      setEditedJson('');
    }
  };

  const handleSave = async () => {
    if (!selectedRecord) return;
    const table = (db as any)[activeTable];
    if (!table) return;
    try {
      setIsSaving(true);
      const parsed = JSON.parse(editedJson);
      // Preserve primary key if missing or changed
      if (!parsed.id && selectedRecord.id) {
        parsed.id = selectedRecord.id;
      }
      await table.put(parsed);
      toast.success('Record updated');
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to update record. Ensure JSON is valid and key fields are correct.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (activeTable === 'settings') {
      toast.error('Settings cannot be deleted. Update the settings record instead.');
      return;
    }
    if (!selectedRecord) return;
    const table = (db as any)[activeTable];
    if (!table) return;
    try {
      const key = selectedRecord.id ?? selectedRecord.key ?? selectedRecord.primaryKey;
      if (key === undefined || key === null) {
        toast.error('Cannot determine primary key for this record');
        return;
      }
      if (activeTable === 'songs') {
        await deleteSongCascade(String(key));
      } else {
        await table.delete(key);
      }
      toast.success('Record deleted');
      setSelectedRecord(null);
      setEditedJson('');
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to delete record');
    }
  };

  const tableLabel = useMemo(() => {
    switch (activeTable) {
      case 'questions':
        return 'Questions';
      case 'modules':
        return 'Modules';
      case 'attempts':
        return 'Attempts';
      case 'integrityEvents':
        return 'Integrity Events';
      case 'tags':
        return 'Tags';
      case 'dailyStats':
        return 'Daily Stats';
      case 'practiceEvents':
        return 'Practice Events';
      case 'settings':
        return 'Settings';
      case 'errorReports':
        return 'Error Reports';
      case 'songs':
        return 'Songs';
      case 'songModules':
        return 'Song Modules';
      case 'songListeningEvents':
        return 'Song Listening Events';
      case 'binaryAssets':
        return 'Binary Assets';
      case 'lyricsSource':
        return 'Lyrics Source';
      case 'users':
        return 'Users';
      default:
        return activeTable;
    }
  }, [activeTable]);

  const questionTypeSummary = useMemo(() => {
    if (activeTable !== 'questions' || !records) {
      return null;
    }
    let mcq = 0;
    let text = 0;
    let fillBlanks = 0;
    let matching = 0;
    let wordCount = 0;

    const stripTags = (html: string | undefined | null): string =>
      (html ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const countWords = (text: string): number =>
      text ? text.split(/\s+/).filter(Boolean).length : 0;

    for (const q of records as any[]) {
      if (q.type === 'mcq') mcq++;
      else if (q.type === 'text') text++;
      else if (q.type === 'fill_blanks') fillBlanks++;
      else if (q.type === 'matching') matching++;

      let combined = '';
      combined += ' ' + stripTags(q.text);
      combined += ' ' + stripTags(q.explanation);

      if (Array.isArray(q.options)) {
        for (const opt of q.options) {
          combined += ' ' + stripTags(opt?.text);
        }
      }

      if (q.matching && Array.isArray(q.matching.pairs)) {
        for (const pair of q.matching.pairs) {
          combined += ' ' + stripTags(pair?.leftText);
          combined += ' ' + stripTags(pair?.rightText);
        }
      }

      wordCount += countWords(combined);
    }

    return { mcq, text, fillBlanks, matching, wordCount };
  }, [activeTable, records]);

  function pickRandom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }

  const generateExplanation = (scope: 'table' | 'record') => {
    try {
      if (scope === 'table') {
        const count = records?.length ?? 0;
        if (!records || records.length === 0) {
          setExplanation(`The ${tableLabel} table is currently empty.`);
          return;
        }

        const sample = records[0] as any;
        const keys = Object.keys(sample);
        const keyPreview = keys.slice(0, 8).join(', ');

        const createdAts = records
          .map((r: any) => r.createdAt ?? r.metadata?.createdAt)
          .filter((v: unknown): v is number => typeof v === 'number');
        const latestCreated = createdAts.length ? new Date(Math.max(...createdAts)).toLocaleString() : null;

        let base: string;
        switch (activeTable) {
          case 'questions': {
            const mcqCount = records.filter((r: any) => r.type === 'mcq').length;
            const textCount = count - mcqCount;
            base = `This table stores the question bank used across modules. It currently holds ${count} question${
              count === 1 ? '' : 's'
            }: ${mcqCount} multiple-choice and ${textCount} free-text.`;
            break;
          }
          case 'modules': {
            const examCount = records.filter((r: any) => r.type === 'exam').length;
            const practiceCount = count - examCount;
            base = `This table defines logical groupings of questions called modules. There are ${count} module${
              count === 1 ? '' : 's'
            }: ${examCount} exam and ${practiceCount} practice.`;
            break;
          }
          case 'attempts': {
            const completedCount = records.filter((r: any) => r.completed).length;
            base = `This table records user attempts when running modules. It contains ${count} attempt${
              count === 1 ? '' : 's'
            }, of which ${completedCount} are marked as completed.`;
            break;
          }
          case 'integrityEvents': {
            base = `This table captures exam integrity events (tab switches, fullscreen exits, keyboard shortcuts, etc.) that occurred during attempts.`;
            break;
          }
          case 'tags': {
            base = `This table lists tags that can be attached to questions and modules. There are ${count} tag${
              count === 1 ? '' : 's'
            } available for filtering and organisation.`;
            break;
          }
          case 'dailyStats': {
            base = `This table stores aggregated daily statistics per module, such as questions done, accuracy and time spent, and is used for analytics views.`;
            break;
          }
          case 'settings': {
            base = `This table stores global application settings. In typical usage there is a single record that controls theme, exam integrity options, default module behaviour and profile fields.`;
            break;
          }
          default: {
            base = `This is the ${tableLabel} table with ${count} record${count === 1 ? '' : 's'}.`;
          }
        }

        const variants = [
          () =>
            base +
            (latestCreated
              ? ` The most recently created entry dates from ${latestCreated}.`
              : '') +
            ` Common fields on these rows include: ${keyPreview}${keys.length > 8 ? ', …' : ''}. Use the list on the left to pick a row and inspect or edit its JSON safely.`,
          () =>
            `${base} Each row typically exposes keys like ${keyPreview}${keys.length > 8 ? ', …' : ''}, giving you direct access to identifiers, timestamps and nested data. Use the search box to narrow down what you see before editing.`,
          () =>
            `${base} Structurally, records in this table share a similar shape, but optional fields may appear depending on context (e.g. timers, review options, or integrity metadata). The key set you will most often care about is: ${keyPreview}${
              keys.length > 8 ? ', …' : ''
            }.`,
        ];

        const pick = pickRandom(variants);
        setExplanation(pick());
      } else if (scope === 'record') {
        if (!selectedRecord) {
          setExplanation('Select a record on the left to get a focused explanation.');
          return;
        }

        const record: any = selectedRecord;
        const keys = Object.keys(record);
        const keyPreview = keys.slice(0, 10).join(', ');
        const identifier = record.id ?? record.key ?? record.primaryKey ?? 'unknown key';

        const createdAt = record.createdAt ?? record.metadata?.createdAt;
        const updatedAt = record.updatedAt ?? record.metadata?.updatedAt;
        const createdLabel = typeof createdAt === 'number' ? new Date(createdAt).toLocaleString() : null;
        const updatedLabel = typeof updatedAt === 'number' ? new Date(updatedAt).toLocaleString() : null;

        let core = `This record (key: ${String(identifier)}) belongs to the ${tableLabel} table. `;

        switch (activeTable) {
          case 'questions': {
            const type = record.type;
            const tags = Array.isArray(record.tags) ? record.tags : [];
            const tagCount = tags.length;
            const modules = Array.isArray(record.modules) ? record.modules : [];
            const moduleCount = modules.length;
            const hasExplanation = typeof record.explanation === 'string' && record.explanation.trim().length > 0;
            core += `It represents a single ${type === 'mcq' ? 'multiple-choice' : 'text'} question linked to ${moduleCount} module${
              moduleCount === 1 ? '' : 's'
            } and tagged with ${tagCount} label${tagCount === 1 ? '' : 's'}.`;
            if (tags.length) {
              core += ` Tags: ${tags.join(', ')}.`;
            }
            if (modules.length) {
              core += ` Modules: ${modules.join(', ')}.`;
            }
            if (Array.isArray(record.options) && record.options.length) {
              core += ` There are ${record.options.length} option${
                record.options.length === 1 ? '' : 's'
              } defined, with correct answers encoded as option IDs.`;
            }
            if (hasExplanation) {
              core += ' An explanation field is present to describe the reasoning behind the answer.';
            }
            break;
          }
          case 'modules': {
            const qCount = Array.isArray(record.questionIds) ? record.questionIds.length : 0;
            const type = record.type;
            const tagCount = Array.isArray(record.tags) ? record.tags.length : 0;
            core += `It defines a ${type} module titled "${record.title ?? ''}" that currently includes ${qCount} question${
              qCount === 1 ? '' : 's'
            } and ${tagCount} tag${tagCount === 1 ? '' : 's'}.`;
            if (record.settings) {
              const s = record.settings;
              const timer = s.timerType && s.timerType !== 'none' ? `${s.timerType} timer` : 'no timer';
              core += ` The settings object controls delivery behaviour, including ${timer}, review options, navigation rules and integrity-related flags.`;
            }
            break;
          }
          case 'attempts': {
            const perQ = Array.isArray(record.perQuestionAttempts) ? record.perQuestionAttempts.length : 0;
            const completed = !!record.completed;
            const score = typeof record.score === 'number' ? record.score : null;
            core += `It corresponds to a specific run of a module (moduleId: ${String(record.moduleId)}). `;
            core += `The attempt tracks ${perQ} per-question attempt${perQ === 1 ? '' : 's'} and includes timing, answers and integrity events.`;
            if (completed || score !== null) {
              core += ` It is marked as ${completed ? 'completed' : 'in progress'}${
                score !== null ? ` with a score of ${score}.` : '.'
              }`;
            }
            if (Array.isArray(record.perQuestionAttempts) && record.perQuestionAttempts.length) {
              const total = record.perQuestionAttempts.length;
              const correct = record.perQuestionAttempts.filter((p: any) => p.isCorrect).length;
              const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
              const durationMs = typeof record.durationMs === 'number' ? record.durationMs : null;
              const seconds = durationMs !== null ? Math.round(durationMs / 1000) : null;
              core += ` Based on recorded per-question attempts, accuracy is approximately ${accuracy}%.`;
              if (seconds !== null) {
                core += ` Total duration is about ${seconds} second${seconds === 1 ? '' : 's'}.`;
              }
            }
            break;
          }
          case 'integrityEvents': {
            core += `It captures a single integrity event of type "${String(record.type)}" associated with attempt ${String(
              record.attemptId
            )}. The timestamp and optional details field help reconstruct what happened at that moment in the exam session.`;
            break;
          }
          case 'tags': {
            core += `It represents a tag named "${record.name ?? ''}" which can be attached to questions and modules to support filtering and organisation.`;
            break;
          }
          case 'dailyStats': {
            core += `It summarises usage statistics for a specific day and module, such as questions done, total correct answers, time spent and attempts completed. These fields feed higher-level analytics views.`;
            break;
          }
          case 'settings': {
            core += `It holds the global application settings record. Within it you will find nested groups for theme preferences, exam integrity configuration, default module options and analytics toggles. Editing this record changes how the entire app behaves.`;
            break;
          }
          default: {
            core += 'It exposes several properties that determine how this part of the system behaves.';
          }
        }

        const temporalBits: string[] = [];
        if (createdLabel) temporalBits.push(`created at ${createdLabel}`);
        if (updatedLabel && updatedLabel !== createdLabel) temporalBits.push(`last updated at ${updatedLabel}`);
        const temporal = temporalBits.length ? ` It was ${temporalBits.join(' and ')}.` : '';

        const tails = [
          () =>
            `Key properties here include: ${keyPreview}${
              keys.length > 10 ? ', …' : ''
            }. You can safely tweak simple scalar fields (text, numbers, booleans), but take extra care with IDs, foreign keys and nested collections as they influence relationships across tables.`,
          () =>
            `From a schema point of view this entry mainly consists of: ${keyPreview}${
              keys.length > 10 ? ', …' : ''
            }. When in doubt, prefer reading this JSON as a snapshot of state rather than editing structural fields such as primary keys or deeply nested arrays.`,
          () =>
            `In practice you will most often look at a subset of fields like ${keyPreview}${
              keys.length > 10 ? ', …' : ''
            }. Use the JSON editor above to review the raw payload and make targeted changes instead of broad rewrites.`,
        ];

        const tailPick = pickRandom(tails);
        setExplanation(core + temporal + `\n\n` + tailPick());
      }
    } catch (e) {
      console.error(e);
      setExplanation('Unable to generate an explanation for this data.');
    }
  };

  const visibleCount = records?.length ?? 0;

  return (
    <Card className="p-6 space-y-4 rounded-2xl border border-border/70 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Database Explorer</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Inspect and edit raw IndexedDB data. Be careful: changes apply immediately.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1">
            {tableLabel} table
          </span>
          <span className="rounded-full bg-muted px-3 py-1">
            Visible: <span className="font-semibold text-foreground">{visibleCount}</span>
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 px-3 py-2 text-xs text-amber-900">
        Changes here apply immediately. Prefer reading data first; edit only if you know exactly what you’re changing.
      </div>

      <Tabs value={activeTable} onValueChange={(v) => setActiveTable(v as ExplorerTableKey)}>
        <TabsList className="mb-3 flex flex-wrap gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="questions" aria-label="Questions" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <HelpCircle className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Questions</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="modules" aria-label="Modules" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <LayoutGrid className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Modules</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="attempts" aria-label="Attempts" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <ClipboardList className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Attempts</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="integrityEvents" aria-label="Integrity" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <Shield className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Integrity</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="tags" aria-label="Tags" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <Tag className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Tags</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="dailyStats" aria-label="Daily Stats" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <CalendarDays className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Daily Stats</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="practiceEvents" aria-label="Practice Events" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <BarChart3 className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Practice Events</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="errorReports" aria-label="Error Reports" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <Bug className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Error Reports</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="songs" aria-label="Songs" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <Music className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Songs</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="songModules" aria-label="Song Modules" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <Layers className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Song Modules</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="songListeningEvents" aria-label="Listening Events" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <Activity className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Listening Events</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="binaryAssets" aria-label="Binary Assets" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <Package className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Binary Assets</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="lyricsSource" aria-label="Lyrics Source" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <ScrollText className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Lyrics Source</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="users" aria-label="Users" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <Users className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Users</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="settings" aria-label="Settings" className="h-9 w-9 p-0 text-primary/70 data-[state=active]:text-primary">
                <SettingsIcon className="h-4 w-4" />
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </TabsList>

        <TabsContent value={activeTable} className="mt-0 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2 lg:col-span-2">
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{tableLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      Search across all fields. Click a row to view/edit JSON.
                    </p>
                  </div>

                  {activeTable === 'questions' && questionTypeSummary ? (
                    <div className="hidden sm:flex flex-wrap justify-end gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-muted px-2.5 py-1">
                        MCQ: <span className="font-semibold text-foreground">{questionTypeSummary.mcq}</span>
                      </span>
                      <span className="rounded-full bg-muted px-2.5 py-1">
                        Text: <span className="font-semibold text-foreground">{questionTypeSummary.text}</span>
                      </span>
                      <span className="rounded-full bg-muted px-2.5 py-1">
                        Fill: <span className="font-semibold text-foreground">{questionTypeSummary.fillBlanks}</span>
                      </span>
                      <span className="rounded-full bg-muted px-2.5 py-1">
                        Matching: <span className="font-semibold text-foreground">{questionTypeSummary.matching}</span>
                      </span>
                      <span className="rounded-full bg-muted px-2.5 py-1">
                        Words: <span className="font-semibold text-foreground">{questionTypeSummary.wordCount.toLocaleString()}</span>
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Refresh"
                      onClick={() => {
                        setRefreshNonce((n) => n + 1);
                        setIsRefreshing(true);
                        window.setTimeout(() => setIsRefreshing(false), 650);
                      }}
                      className="h-9 w-9 rounded-full border border-border/70 bg-background shadow-sm hover:bg-accent"
                    >
                      <RefreshCw className={"h-4 w-4 " + (isRefreshing ? 'animate-spin' : '')} />
                    </Button>

                    <Select value={String(recordLimit)} onValueChange={(v) => setRecordLimit(Number(v))}>
                      <SelectTrigger className="h-9 w-[108px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50 rows</SelectItem>
                        <SelectItem value="200">200 rows</SelectItem>
                        <SelectItem value="500">500 rows</SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      placeholder="Search JSON..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="sm:max-w-xs"
                    />
                    {search.trim() ? (
                      <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                        Clear
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="whitespace-nowrap"
                      disabled={!records || records.length === 0 || isBulkDeleting}
                      onClick={() => setShowBulkDeleteDialog(true)}
                    >
                      Delete visible
                    </Button>
                  </div>
                </div>
              </div>

              <ScrollArea className="h-72 rounded-md border bg-background">
                <div className="divide-y text-sm">
                  {records && records.length > 0 ? (
                    records.map((row: any, idx: number) => {
                      const id = row.id ?? row.key ?? idx;
                      let preview = '';
                      try {
                        const json = safeJsonStringify(row);
                        preview = json.length > 140 ? json.slice(0, 140) + '…' : json;
                      } catch {
                        preview = '[unserializable]';
                      }
                      const isActive = selectedRecord && (selectedRecord.id ?? selectedRecord.key) === (row.id ?? row.key);
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`w-full text-left px-3 py-2 hover:bg-muted/70 ${isActive ? 'bg-muted' : ''}`}
                          onClick={() => handleSelect(row)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-muted-foreground truncate">
                              {String(id)}
                            </span>
                            <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 uppercase">
                              {activeTable}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-foreground break-words line-clamp-2">
                            {preview}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-4 text-xs text-muted-foreground text-center">
                      No records found for this table.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Selected record</p>
                {selectedRecord && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {String(selectedRecord.id ?? selectedRecord.key ?? '')}
                  </Badge>
                )}
              </div>
              <textarea
                className="w-full h-72 font-mono text-xs rounded-md border bg-background p-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                value={editedJson}
                onChange={(e) => setEditedJson(e.target.value)}
                placeholder="Select a record on the left to view/edit its raw JSON."
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedRecord ? (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" onClick={handleCopySelected} aria-label="Copy JSON" className="h-9 w-9 rounded-full">
                            <Copy className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy JSON</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" onClick={handleDownloadSelected} aria-label="Download JSON" className="h-9 w-9 rounded-full">
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download JSON</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setShowJsonPreview(true)}
                            aria-label="Preview JSON"
                            className="h-9 w-9 rounded-full"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Preview JSON</TooltipContent>
                      </Tooltip>
                    </>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={!selectedRecord || isSaving}
                        onClick={handleDelete}
                        aria-label="Delete record"
                        className="h-9 w-9 rounded-full"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        disabled={!selectedRecord || isSaving}
                        onClick={handleSave}
                        aria-label="Save record"
                        className="h-9 w-9 rounded-full"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Explanation</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateExplanation('table')}
                  disabled={!records || (records?.length ?? 0) === 0}
                >
                  Explain table
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateExplanation('record')}
                  disabled={!selectedRecord}
                >
                  Explain record
                </Button>
              </div>
            </div>
            <div className="rounded-md border bg-muted/40 px-3 py-2 min-h-[4rem] text-xs text-muted-foreground whitespace-pre-wrap">
              {explanation || 'Use the buttons above to generate a short explanation of this table or the currently selected record.'}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all visible records?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all records currently visible in the {tableLabel} table for the active search.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await handleBulkDeleteVisible();
                setShowBulkDeleteDialog(false);
              }}
            >
              Delete visible
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

		<Dialog open={showJsonPreview} onOpenChange={setShowJsonPreview}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>JSON Preview</DialogTitle>
					<DialogDescription>Read-only view of the selected record.</DialogDescription>
				</DialogHeader>
				<div className="rounded-md border bg-muted/30 p-3 max-h-[70vh] overflow-auto">
					<pre className="text-xs font-mono whitespace-pre-wrap break-words">
						{selectedRecord ? safeJsonStringify(selectedRecord, 2) : 'No record selected.'}
					</pre>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setShowJsonPreview(false)}>Close</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
    </Card>
  );
}
