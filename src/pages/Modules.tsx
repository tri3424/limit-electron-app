import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db, Question, Tag, User } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Eye, Pencil, RefreshCw, Trash2, Plus, BarChart3 } from 'lucide-react';
import { deleteModule, resetModuleProgress } from '@/lib/modules';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getDailyStatsSummaryForModule, getDailyStatsSummaryForModuleAndUsers, listDailyStatsDatesForModule, getDayQuestionDetails, clearAllDailyStats, type DayQuestionDetail, type DailyStatsSummary } from '@/lib/statsHelpers';
import { toast } from 'sonner';
import { MatchingQuestionView } from '@/components/MatchingQuestionView';
import { MatchingQuestionAttemptView } from '@/components/MatchingQuestionAttemptView';
import { FillBlanksAttemptView } from '@/components/FillBlanksAttemptView';
import { Checkbox } from '@/components/ui/checkbox';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { prepareContentForDisplay } from '@/lib/contentFormatting';
import { renderTypingAnswerMathToHtml } from '@/components/TypingAnswerMathInput';
import { copyTextToClipboard } from '@/utils/codeBlockCopy';
import { areAllQuestionsCompleted } from '@/lib/completedQuestions';

export default function ModulesPage() {
	const modules = useLiveQuery(() => db.modules.toArray(), []);
	const users = useLiveQuery(() => db.users.toArray(), []) as User[] | undefined;
	const navigate = useNavigate();

	const getQuestionPreview = (html: string, maxLen = 90) => {
		const raw = (html || '').trim();
		if (!raw) return '—';
		let text = raw;
		try {
			const doc = new DOMParser().parseFromString(raw, 'text/html');
			// KaTeX includes hidden MathML + annotation text containing the original LaTeX source.
			// If we take textContent directly, we end up showing commands like "\\times" in previews.
			doc.body.querySelectorAll('.katex-mathml, annotation, .tk-katex-controls, [data-katex-action]').forEach((el) => el.remove());
			text = doc.body.textContent || raw;
		} catch {
			text = raw;
		}
		text = text.replace(/\s+/g, ' ').trim();
		if (!text) return '—';
		return text.length > maxLen ? `${text.slice(0, maxLen).trimEnd()}…` : text;
	};

	// Modal state
	const [openModuleId, setOpenModuleId] = useState<string | null>(null);
	const [moduleQuestions, setModuleQuestions] = useState<Question[]>([]);
	const [availableTags, setAvailableTags] = useState<Tag[]>([]);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [refreshId, setRefreshId] = useState<string | null>(null);

	// Filters
	const [search, setSearch] = useState('');
	const [typeFilter, setTypeFilter] = useState<'all' | 'mcq' | 'text'>('all');
	const [tagFilters, setTagFilters] = useState<string[]>([]);

	// Question details modal
	const [openQuestion, setOpenQuestion] = useState<Question | null>(null);

	// Stats dialog
	const [statsOpen, setStatsOpen] = useState(false);
	const [statsDates, setStatsDates] = useState<string[]>([]);
	const [selectedDate, setSelectedDate] = useState<string | null>(() => new Date().toISOString().slice(0, 10));
	const [summary, setSummary] = useState<DailyStatsSummary | null>(null);
	const [dayDetails, setDayDetails] = useState<DayQuestionDetail[]>([]);
	const [statsModuleId, setStatsModuleId] = useState<string | null>(null);
	const [statsUserIdFilter, setStatsUserIdFilter] = useState<string | 'all'>('all');
	const [clearStatsConfirmOpen, setClearStatsConfirmOpen] = useState(false);
	const [openStatDetail, setOpenStatDetail] = useState<DayQuestionDetail | null>(null);

	// Assign students dialog
	const [assignModuleId, setAssignModuleId] = useState<string | null>(null);
	const [assignSelectedIds, setAssignSelectedIds] = useState<string[]>([]);

	// Completion status for practice modules (per student)
	const [completionStatus, setCompletionStatus] = useState<Record<string, Record<string, boolean>>>({});

	// Watch attempts to refresh completion status
	const practiceAttemptsCount = useLiveQuery(async () => {
		if (!modules || !users) return 0;
		const practiceModuleIds = modules.filter(m => m.type === "practice").map(m => m.id);
		if (practiceModuleIds.length === 0) return 0;
		const count = await db.attempts
			.where('moduleId')
			.anyOf(practiceModuleIds)
			.filter(a => a.completed === true)
			.count();
		return count;
	}, [modules, users]) || 0;

	// Check completion status for all practice modules and assigned students
	useEffect(() => {
		const checkCompletions = async () => {
			if (!modules || !users) {
				setCompletionStatus({});
				return;
			}

			const status: Record<string, Record<string, boolean>> = {};
			
			for (const module of modules) {
				if (module.type === "practice") {
					status[module.id] = {};
					const assignedIds = getAssignedIdsForModule(module.id);
					
					// Check completion for each assigned student
					for (const userId of assignedIds) {
						try {
							const completed = await areAllQuestionsCompleted(module.id, userId);
							status[module.id][userId] = completed;
						} catch (error) {
							console.error(`Error checking completion for module ${module.id}, user ${userId}:`, error);
							status[module.id][userId] = false;
						}
					}
				}
			}
			
			setCompletionStatus(status);
		};

		checkCompletions();
	}, [modules, users, practiceAttemptsCount]);

	useEffect(() => {
		db.tags.toArray().then(setAvailableTags);
	}, []);

	useEffect(() => {
		(async () => {
			if (!openModuleId) return;
			const mod = await db.modules.get(openModuleId);
			if (!mod) return;
			const qs = await db.questions.bulkGet(mod.questionIds);
			setModuleQuestions((qs.filter(Boolean) as Question[]) || []);
		})();
	}, [openModuleId]);

	useEffect(() => {
		if (!statsOpen || !statsModuleId) return;
		(async () => {
			const dates = await listDailyStatsDatesForModule(statsModuleId, 60);
			setStatsDates(dates);
			// If there are recorded dates and no explicit selection (e.g. after clear),
			// fall back to the latest recorded date; otherwise keep the current selection
			// which defaults to today's date.
			if (dates.length && !selectedDate) {
				setSelectedDate(dates[dates.length - 1]);
			}
		})();
	}, [statsOpen, selectedDate, statsModuleId]);

	useEffect(() => {
		if (!selectedDate || !statsModuleId) return;
		(async () => {
			const details = await getDayQuestionDetails(selectedDate, {
				moduleId: statsModuleId,
				userIds: statsUserIdFilter && statsUserIdFilter !== 'all' ? [statsUserIdFilter] : undefined,
			});
			setDayDetails(details);
			const s =
				statsUserIdFilter && statsUserIdFilter !== 'all'
					? await getDailyStatsSummaryForModuleAndUsers(selectedDate, statsModuleId, [statsUserIdFilter])
					: await getDailyStatsSummaryForModule(selectedDate, statsModuleId);
			setSummary(s);
		})();
	}, [selectedDate, statsModuleId, statsUserIdFilter]);

	const filteredQuestions = useMemo(() => {
		const s = search.trim().toLowerCase();
		const base = moduleQuestions.filter((q) => {
			const matchesType = typeFilter === 'all' ? true : q.type === typeFilter;

			// Robust code search: allow searching by full code (e.g. "Q-1234")
			// or just the suffix ("1234"), case-insensitive.
			const code = (q.code || '').toString().toLowerCase();
			const codeSuffix = code.replace(/^q[-_]?/, '');
			const matchesCode = s
				? code.includes(s) || codeSuffix.includes(s)
				: true;

			const matchesSearch = !s
				? true
				: q.text.toLowerCase().includes(s) ||
				  (q.options || []).some((o) => o.text.toLowerCase().includes(s)) ||
				  (q.explanation || '').toLowerCase().includes(s) ||
				  matchesCode;

			const matchesTags = tagFilters.length === 0 ? true : tagFilters.every((t) => q.tags.includes(t));
			return matchesType && matchesSearch && matchesTags;
		});
		// Sort by most recently created first
		return base.slice().sort((a, b) => {
			const aCreated = a.metadata?.createdAt ?? 0;
			const bCreated = b.metadata?.createdAt ?? 0;
			return bCreated - aCreated;
		});
	}, [moduleQuestions, search, typeFilter, tagFilters]);
	const list = modules ?? [];
	const usersById = new Map((users ?? []).map((u) => [u.id, u]));

	const statsUserOptions = useMemo(() => {
		if (!dayDetails.length || !users?.length) return [];
		const ids = Array.from(
			new Set(
				dayDetails
					.map((d) => d.userId)
					.filter((id): id is string => typeof id === 'string' && id.length > 0),
			),
		);
		return ids
			.map((id) => usersById.get(id))
			.filter((u): u is User => !!u)
			.sort((a, b) => a.username.localeCompare(b.username));
	}, [dayDetails, users, usersById]);

	const getAssignedIdsForModule = (modId: string): string[] => {
		const mod = list.find((m) => m.id === modId) as any;
		if (!mod) return [];
		if (Array.isArray(mod.assignedUserIds)) {
			return mod.assignedUserIds as string[];
		}
		if (typeof mod.assignedUserId === 'string' && mod.assignedUserId) {
			return [mod.assignedUserId as string];
		}
		return [];
	};
	return (
		<div className="space-y-6 max-w-7xl mx-auto">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Modules</h1>
					<p className="text-sm text-muted-foreground">Create, edit, and manage your modules.</p>
				</div>
				<div className="flex gap-2">
					<Button onClick={() => navigate('/modules/new')}>
						<Plus className="h-4 w-4 mr-2" /> Create Module
					</Button>
				</div>
			</div>
			<div className="space-y-4">
				{list.map((m) => {
					const formatDateTime = (ms: number) => {
						if (!ms) return 'Not set';
						const d = new Date(ms);
						return d.toLocaleString();
					};
					const assignedIds = getAssignedIdsForModule(m.id);
					const assignedUsers = assignedIds.map((id) => usersById.get(id)).filter(Boolean) as User[];
					
					// Check if any assigned student has completed this practice module
					const moduleCompletionStatus = completionStatus[m.id] || {};
					const hasCompletedStudents = assignedIds.some(userId => moduleCompletionStatus[userId] === true);
					const completedStudents = assignedIds.filter(userId => moduleCompletionStatus[userId] === true);
					
					return (
						<Card
							key={m.id}
							className="flex items-stretch justify-between px-6 py-4 rounded-xl shadow-sm hover:shadow-md transition-shadow bg-green-50 border border-green-200"
						>
							<div className="flex-1 pr-6 min-w-0">
								<div className="flex items-center gap-3">
									<h3 className="text-4xl font-semibold text-foreground truncate">{m.title}</h3>
									{m.type === "practice" && hasCompletedStudents && (
										<Badge variant="default" className="bg-green-600 text-white font-semibold px-3 py-1">
											COMPLETED
										</Badge>
									)}
								</div>
								{m.description && (
									<p className="mt-2 text-sm text-foreground line-clamp-2">{m.description}</p>
								)}
								<div className="mt-2 space-y-1">
									<div className="text-xs text-muted-foreground">
										{m.questionIds.length} questions
									</div>
									{m.type === "practice" && hasCompletedStudents && completedStudents.length > 0 && (
										<div className="text-xs text-green-700 font-medium">
											Completed by {completedStudents.length} student{completedStudents.length === 1 ? '' : 's'}
										</div>
									)}
									{users && users.length > 0 && (
										<div className="flex flex-col gap-1 text-xs text-muted-foreground">
											<div className="flex items-center gap-2">
												<span>Assigned students:</span>
												<Button
													variant="outline"
													size="sm"
													className="h-7 px-2 text-xs"
													onClick={() => {
														setAssignModuleId(m.id);
														setAssignSelectedIds(assignedIds);
													}}
												>
													Manage
												</Button>
											</div>
											<div className="flex flex-wrap gap-1">
												{assignedUsers.length > 0 ? (
													assignedUsers.map((u) => (
														<Badge key={u.id} variant="outline">
															{u.username}
														</Badge>
													))
												) : (
													<span className="text-[11px] italic text-muted-foreground">
														No students assigned
													</span>
												)}
											</div>
										</div>
									)}
									{m.type === 'exam' && m.scheduledStartUtc && m.scheduledEndUtc && (
										<div className="text-xs text-muted-foreground space-y-0.5">
											<div>Start: <span className="font-semibold text-foreground">{formatDateTime(m.scheduledStartUtc)}</span></div>
											<div>End: <span className="font-semibold text-foreground">{formatDateTime(m.scheduledEndUtc)}</span></div>
										</div>
									)}
								</div>
							</div>
							<div className="flex items-center justify-end gap-2">
								<Button
									variant="ghost"
									size="icon"
									className="text-green-800 hover:bg-transparent hover:text-green-900"
									onClick={() => setOpenModuleId(m.id)}
									title="View questions"
								>
									<Eye className="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="text-green-800 hover:bg-transparent hover:text-green-900"
									onClick={() => navigate(`/modules/${m.id}/edit`)}
									title="Edit module / instructions"
								>
									<Pencil className="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="text-green-800 hover:bg-transparent hover:text-green-900"
									onClick={() => setRefreshId(m.id)}
									title="Refresh module progress"
								>
									<RefreshCw className="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="text-destructive hover:bg-transparent hover:text-destructive/90"
									onClick={() => setDeleteId(m.id)}
									title="Delete module"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="text-green-800 hover:bg-transparent hover:text-green-900"
									onClick={() => { setStatsModuleId(m.id); setStatsOpen(true); setSelectedDate(new Date().toISOString().slice(0, 10)); }}
									title="View stats for this module"
								>
									<BarChart3 className="h-4 w-4" />
								</Button>
							</div>
						</Card>
					);
				})}
			</div>
			{list.length === 0 && (
				<Card className="p-8 text-center text-muted-foreground">No modules yet. Create one to get started.</Card>
			)}

			{/* Assign Students Dialog */}
			<Dialog
				open={!!assignModuleId}
				onOpenChange={(open) => {
					if (!open) {
						setAssignModuleId(null);
						setAssignSelectedIds([]);
					}
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Assign Students to Module</DialogTitle>
						<DialogDescription>
							Select one or more students who should be associated with this module.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
						{(users ?? []).length === 0 && (
							<div className="text-sm text-muted-foreground">
								No students found. Create users from the Settings page first.
							</div>
						)}
						{(users ?? []).map((u) => {
							const checked = assignSelectedIds.includes(u.id);
							return (
								<label
									key={u.id}
									className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
								>
									<div className="flex items-center gap-2">
										<Checkbox
											checked={checked}
											onCheckedChange={(v: CheckedState) => {
												setAssignSelectedIds((prev) =>
													v === true
														? Array.from(new Set([...prev, u.id]))
														: prev.filter((id) => id !== u.id)
												);
											}}
										/>
										<span>{u.username}</span>
									</div>
								</label>
							);
						})}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setAssignModuleId(null);
								setAssignSelectedIds([]);
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={async () => {
								if (!assignModuleId) return;
								await db.modules.update(assignModuleId, {
									assignedUserIds: assignSelectedIds,
								});
								setAssignModuleId(null);
								setAssignSelectedIds([]);
							}}
						>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Refresh Module Confirmation */}
			<Dialog open={!!refreshId} onOpenChange={(open) => { if (!open) setRefreshId(null); }}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Refresh Module Progress</DialogTitle>
						<DialogDescription>
							This will delete all attempts, integrity logs, and stats for this module, but keep the module and its questions.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRefreshId(null)}>Cancel</Button>
						<Button
							variant="destructive"
							onClick={async () => {
								if (!refreshId) return;
								await resetModuleProgress(refreshId);
								setRefreshId(null);
								toast.success('Module progress refreshed');
							}}
						>
							Refresh
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			{/* Stats Question Detail Modal */}
			<Dialog open={!!openStatDetail} onOpenChange={(open) => { if (!open) setOpenStatDetail(null); }}>
				<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Question Attempt Details</DialogTitle>
					</DialogHeader>
					{openStatDetail && (
						<div className="space-y-4">
								<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
								<div className="space-x-2">
									<span className="font-semibold text-foreground">{openStatDetail.moduleTitle}</span>
									{openStatDetail.moduleType && (
										<Badge variant="outline" className="text-[10px] uppercase">{openStatDetail.moduleType}</Badge>
									)}
								</div>
								<div className="flex flex-wrap items-center gap-3">
									{openStatDetail.username && (
										<span>
											Student:{' '}
											<span className="font-semibold text-foreground">
												{openStatDetail.username}
											</span>
										</span>
									)}
									{openStatDetail.questionCode && (
										<button
											type="button"
											className="font-mono cursor-pointer select-none text-left"
											onClick={(e) => {
												e.stopPropagation();
												void copyTextToClipboard(openStatDetail.questionCode!, 'Question code copied!');
											}}
											title="Click to copy"
										>
											Code: <span className="font-semibold text-foreground">{openStatDetail.questionCode}</span>
										</button>
									)}
									{openStatDetail.questionType && (
										<span>Type: <span className="font-semibold text-foreground uppercase">{openStatDetail.questionType}</span></span>
									)}
								</div>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
								<div>
									<div className="font-semibold text-foreground">Started at</div>
									<div>{new Date(openStatDetail.startedAt).toLocaleString('en-US', { 
										year: 'numeric', 
										month: '2-digit', 
										day: '2-digit', 
										hour: '2-digit', 
										minute: '2-digit', 
										second: '2-digit',
										hour12: true 
									})}</div>
								</div>
								<div>
									<div className="font-semibold text-foreground">Submitted at</div>
									<div>{new Date(openStatDetail.submittedAt).toLocaleString('en-US', { 
										year: 'numeric', 
										month: '2-digit', 
										day: '2-digit', 
										hour: '2-digit', 
										minute: '2-digit', 
										second: '2-digit',
										hour12: true 
									})}</div>
								</div>
							</div>
							<div className="space-y-2">
								<div className="text-sm text-muted-foreground">Question</div>
								<div className="prose prose-sm max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(openStatDetail.questionText) }} />
							</div>
							{/* Show MCQ options if available */}
							{openStatDetail.questionType === 'mcq' && openStatDetail.questionOptions && openStatDetail.questionOptions.length > 0 && (
								<div className="space-y-2">
									<div className="text-sm font-semibold">Options</div>
									<div className="grid gap-2">
										{openStatDetail.questionOptions.map((opt, optIndex) => {
											const optionLabel = String.fromCharCode(65 + optIndex); // A, B, C, etc.
											const isCorrectOpt = openStatDetail.correctAnswerIds?.includes(opt.id) ?? false;
											const userSelected = Array.isArray(openStatDetail.userAnswerIds)
												? openStatDetail.userAnswerIds.includes(opt.id)
												: openStatDetail.userAnswerIds === opt.id;
											
											// Determine highlighting: green for correct, red for user's wrong selection
											let highlightClass = '';
											if (isCorrectOpt) {
												highlightClass = 'border-green-600 bg-green-50';
											} else if (userSelected && !isCorrectOpt) {
												highlightClass = 'border-red-600 bg-red-50';
											}
											
											return (
												<div
													key={opt.id}
													className={`text-left rounded-md border p-3 ${highlightClass}`}
												>
													<span className="font-semibold mr-2">{optionLabel}.</span>
													<span className="content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(opt.text) }} />
												</div>
											);
										})}
									</div>
								</div>
							)}
							{/* Show matching question attempt */}
							{openStatDetail.questionType === 'matching' && openStatDetail.questionMatching && (
								<MatchingQuestionAttemptView detail={openStatDetail} />
							)}
							{/* Show fill-blanks question attempt */}
							{openStatDetail.questionType === 'fill_blanks' && openStatDetail.questionFillBlanks && (
								<FillBlanksAttemptView detail={openStatDetail} />
							)}
							{/* Show text answers for text questions */}
							{openStatDetail.questionType === 'text' && (
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-1">
										<div className="text-sm font-semibold">Your Answer</div>
										{openStatDetail.userAnswer && String(openStatDetail.userAnswer).includes('<') ? (
											<div className="text-sm text-foreground prose prose-sm max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(String(openStatDetail.userAnswer)) }} />
										) : (
											<div
												className={`text-sm text-foreground whitespace-pre-wrap content-html ${openStatDetail.userAnswer === '—' ? 'text-muted-foreground' : ''}`}
												dangerouslySetInnerHTML={{ __html: renderTypingAnswerMathToHtml(String(openStatDetail.userAnswer || '—')) }}
											/>
										)}
									</div>
									<div className="space-y-1">
										<div className="text-sm font-semibold">Correct Answer{openStatDetail.correctAnswer.includes(',') ? 's' : ''}</div>
										{openStatDetail.correctAnswer && String(openStatDetail.correctAnswer).includes('<') ? (
											<div className="text-sm text-foreground prose prose-sm max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(String(openStatDetail.correctAnswer)) }} />
										) : (
											<div
												className="text-sm text-foreground whitespace-pre-wrap border-green-600 bg-green-50 border rounded-md p-2 content-html"
												dangerouslySetInnerHTML={{ __html: renderTypingAnswerMathToHtml(String(openStatDetail.correctAnswer || '—')) }}
											/>
										)}
									</div>
								</div>
							)}
							{openStatDetail.isCorrect === undefined ? (
								<div className="text-sm">
									Result:{' '}
									<span className="text-muted-foreground font-semibold">
										Unattempted
									</span>
								</div>
							) : typeof openStatDetail.isCorrect === 'boolean' && (
								<div className="text-sm">
									Result:{' '}
									<span className={openStatDetail.isCorrect ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
										{openStatDetail.isCorrect ? 'Correct' : 'Incorrect'}
									</span>
								</div>
							)}
							{openStatDetail.explanationHtml && (
								<div className="space-y-1">
									<div className="text-sm font-semibold">Explanation</div>
									<div className="prose prose-sm max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(openStatDetail.explanationHtml) }} />
								</div>
							)}
						</div>
					)}
				</DialogContent>
			</Dialog>

			{/* Module Questions Modal */}
			<Dialog open={!!openModuleId} onOpenChange={(open) => { if (!open) { setOpenModuleId(null); setSearch(''); setTypeFilter('all'); setTagFilters([]); } }}>
				<DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>Module Questions</DialogTitle>
						<DialogDescription>Browse and filter questions in this module.</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3 pb-3">
						<div className="flex flex-wrap gap-3 items-center">
							<Input className="flex-1 min-w-0" placeholder="Search questions..." value={search} onChange={(e) => setSearch(e.target.value)} />
							<Select value={typeFilter} onValueChange={(v: 'all' | 'mcq' | 'text') => setTypeFilter(v)}>
								<SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All</SelectItem>
									<SelectItem value="mcq">MCQ</SelectItem>
									<SelectItem value="text">Text</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{availableTags.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{availableTags.map((t) => {
									const selected = tagFilters.includes(t.name);
									return (
										<button key={t.id} type="button" onClick={() => setTagFilters((prev) => selected ? prev.filter(x => x !== t.name) : [...prev, t.name])}>
											<Badge variant={selected ? 'default' : 'secondary'}>{t.name}</Badge>
										</button>
									);
								})}
							</div>
						)}
						<ScrollArea className="h-[60vh] rounded-md border">
							<div className="divide-y">
								{filteredQuestions.map((q, idx) => (
									<div key={q.id} className="p-4 flex items-start justify-between gap-4">
										<div className="space-y-1 min-w-0">
											<div className="text-sm text-muted-foreground">
												Q{idx + 1}{' '}
												<span className="font-medium">{q.type.toUpperCase()}</span>
												{q.code && (
													<button
														type="button"
														className="ml-2 font-mono hover:underline cursor-pointer select-none"
														onClick={(e) => {
															e.stopPropagation();
															void copyTextToClipboard(q.code!, 'Question code copied!');
														}}
														title="Click to copy"
													>
														({q.code})
													</button>
												)}
											</div>
											<div
												className="font-medium text-foreground content-html line-clamp-2"
												dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(q.text) }}
											/>
											<div className="flex flex-wrap gap-1">
												{q.tags.slice(0, 6).map((t) => (<Badge key={t} variant="outline">{t}</Badge>))}
											</div>
										</div>
										<div className="shrink-0 flex items-center gap-2">
											<Button size="sm" onClick={() => setOpenQuestion(q)}>View</Button>
										</div>
									</div>
								))}
								{filteredQuestions.length === 0 && (
									<div className="p-8 text-center text-muted-foreground">No questions match the current filters.</div>
								)}
							</div>
						</ScrollArea>
					</div>
				</DialogContent>
			</Dialog>

			{/* Question Details Modal */}
			<Dialog open={!!openQuestion} onOpenChange={(open) => { if (!open) setOpenQuestion(null); }}>
				<DialogContent className="max-w-5xl">
					<DialogHeader>
						<DialogTitle>Question Details</DialogTitle>
					</DialogHeader>
					{openQuestion && (
						<ScrollArea className="h-[70vh]">
							<div className="space-y-4 pr-2">
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									{openQuestion.code && (
										<button
											type="button"
											className="font-mono cursor-pointer select-none text-left"
											onClick={(e) => {
												e.stopPropagation();
												void copyTextToClipboard(openQuestion.code!, 'Question code copied!');
											}}
											title="Click to copy"
										>
											Code: <span className="font-semibold text-foreground">{openQuestion.code}</span>
										</button>
									)}
									<div>Type: <span className="font-semibold text-foreground uppercase">{openQuestion.type}</span></div>
								</div>
								<div>
									<div className="text-xs text-muted-foreground mb-1">Type</div>
									<div className="font-medium">{openQuestion.type.toUpperCase()}</div>
								</div>
								<div>
									<div className="text-xs text-muted-foreground mb-1">Question</div>
									<div
										className="prose max-w-none content-html"
										dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(openQuestion.text) }}
									/>
								</div>
								{openQuestion.type === 'mcq' && (
									<div>
										<div className="text-xs text-muted-foreground mb-1">Options</div>
										<div className="grid gap-2">
											{(openQuestion.options || []).map((o, optIndex) => {
												const isCorrect = Array.isArray(openQuestion.correctAnswers) && openQuestion.correctAnswers.includes(o.id);
												const optionLabel = String.fromCharCode(65 + optIndex); // A, B, C, etc.
												return (
													<div key={o.id} className={`rounded-md border p-2 ${isCorrect ? 'border-green-500 bg-green-50' : ''}`}>
														<span className="font-semibold mr-2">{optionLabel}.</span>
														<span className="text-sm content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(o.text) }} />
													</div>
												);
											})}
										</div>
									</div>
								)}
								{openQuestion.type === 'matching' && (
									<div>
										<div className="text-xs text-muted-foreground mb-1">Matching Pairs</div>
										<MatchingQuestionView question={openQuestion} />
									</div>
								)}
								{openQuestion.type !== 'mcq' && openQuestion.type !== 'matching' && openQuestion.correctAnswers && openQuestion.correctAnswers.length > 0 && (
									<div>
										<div className="text-xs text-muted-foreground mb-1">Correct Answer{openQuestion.correctAnswers.length > 1 ? 's' : ''}</div>
										{openQuestion.type === 'text' ? (
											<div className="text-sm">
												{openQuestion.correctAnswers.map((ans, idx) => (
													<span key={`${ans}-${idx}`}>
														{idx > 0 ? ', ' : ''}
														<span className="content-html" dangerouslySetInnerHTML={{ __html: renderTypingAnswerMathToHtml(ans) }} />
													</span>
												))}
											</div>
										) : (
											<div className="text-sm">{openQuestion.correctAnswers.join(', ')}</div>
										)}
									</div>
								)}
								{openQuestion.explanation && (
									<div>
										<div className="text-xs text-muted-foreground mb-1">Explanation</div>
										<div className="prose prose-sm max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(openQuestion.explanation) }} />
									</div>
								)}
								{openQuestion.tags && openQuestion.tags.length > 0 && (
									<div>
										<div className="text-xs text-muted-foreground mb-1">Tags</div>
										<div className="flex flex-wrap gap-1">
											{openQuestion.tags.map((t) => (<Badge key={t} variant="secondary">{t}</Badge>))}
										</div>
									</div>
								)}
							</div>
						</ScrollArea>
					)}
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Modal */}
			<Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Delete Module</DialogTitle>
						<DialogDescription>
							This action cannot be undone. Are you sure you want to delete this module?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
						<Button variant="destructive" onClick={async () => { if (!deleteId) return; await deleteModule(deleteId); setDeleteId(null); }}>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Stats Dialog */}
			<Dialog open={statsOpen} onOpenChange={(open) => {
				setStatsOpen(open);
				if (!open) {
					setStatsModuleId(null);
					setSelectedDate(new Date().toISOString().slice(0, 10));
					setStatsDates([]);
					setSummary(null);
					setDayDetails([]);
					setStatsUserIdFilter('all');
				}
			}}>
				<DialogContent className="max-w-6xl">
					<DialogHeader>
						<DialogTitle>Daily Performance</DialogTitle>
						<DialogDescription>
							Select a day and optionally focus on a particular student&apos;s activity for this module.
						</DialogDescription>
					</DialogHeader>
					<div className="grid grid-cols-12 gap-4">
						{/* Days list */}
						<div className="col-span-4">
							<Card className="p-3 h-[64vh] overflow-hidden">
								<div className="flex items-center justify-between mb-2">
									<div className="text-sm font-medium">Days</div>
									<Button
										variant="outline"
										size="sm"
										className="text-xs border-destructive text-destructive hover:bg-destructive/10"
										onClick={() => setClearStatsConfirmOpen(true)}
									>
										Clear stats
									</Button>
								</div>
								<ScrollArea className="h-[58vh] rounded-md">
									<div className="divide-y">
										{statsDates.length ? statsDates.slice().reverse().map((d) => (
											<div key={d} className={`p-3 flex items-center justify-between ${selectedDate === d ? 'bg-muted' : ''}`}>
												<div className="text-sm font-medium">{d}</div>
												<Button size="sm" variant="outline" onClick={() => setSelectedDate(d)}>View</Button>
											</div>
										)) : (
											<div className="p-6 text-center text-muted-foreground">No days recorded.</div>
										)}
									</div>
								</ScrollArea>
							</Card>
						</div>
						{/* Details */}
						<div className="col-span-8">
							<Card className="p-3 h-[64vh] overflow-hidden">
								<div className="flex flex-wrap items-center justify-between gap-3 mb-3">
									<div className="space-y-0.5">
										<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
											Selected day
										</div>
										<div className="font-semibold">
											{selectedDate
												? new Date(selectedDate).toLocaleDateString()
												: new Date().toLocaleDateString()}
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
										{statsModuleId && (
											<span>
												Module:{' '}
												<span className="font-semibold text-foreground">
													{modules?.find((m) => m.id === statsModuleId)?.title || 'Current module'}
												</span>
											</span>
										)}
										{users && users.length > 0 && (
											<div className="flex items-center gap-2">
												<span>Student:</span>
												<Select
													value={statsUserIdFilter}
													onValueChange={(value: string) => setStatsUserIdFilter(value as string | 'all')}
												>
													<SelectTrigger className="h-8 w-40 text-xs">
														<SelectValue placeholder="All students" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="all">All students</SelectItem>
														{statsUserOptions.map((u) => (
															<SelectItem key={u.id} value={u.id}>
																{u.username}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										)}
									</div>
								</div>
								<ScrollArea className="h-[55vh] rounded-md">
									{summary ? (
										<div className="space-y-3 pr-2">
											<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
												<Card className="p-3"><div className="text-xs text-muted-foreground">Questions Done</div><div className="text-lg font-semibold">{summary.totalQuestionsDone}</div></Card>
												<Card className="p-3"><div className="text-xs text-muted-foreground">Accuracy</div><div className="text-lg font-semibold">{summary.accuracy}%</div></Card>
												<Card className="p-3"><div className="text-xs text-muted-foreground">Avg Time/Q</div><div className="text-lg font-semibold">{Math.round(summary.averageTimePerQuestionMs / 1000)}s</div></Card>
												<Card className="p-3"><div className="text-xs text-muted-foreground">Attempts</div><div className="text-lg font-semibold">{summary.attemptsCompleted}</div></Card>
											</div>
											<div>
												<div className="text-sm font-medium mt-2 mb-2">
													Question-level details
													{statsUserIdFilter !== 'all' && statsUserOptions.length
														? ` for ${
																statsUserOptions.find((u) => u.id === statsUserIdFilter)?.username ?? 'selected student'
														  }`
														: ''}
												</div>
												<div className="rounded-md border overflow-hidden">
													<div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-medium">
														<div className="col-span-2">Submitted At</div>
														<div className="col-span-3">Module</div>
														<div className="col-span-2">Student</div>
														<div className="col-span-5">Question • Your Answer</div>
													</div>
													<div className="divide-y">
														{dayDetails.length ? dayDetails.map((d, idx) => (
															<div
																key={`${d.questionId}-${d.submittedAt}-${idx}`}
																className="grid grid-cols-12 gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/70"
																onClick={() => setOpenStatDetail(d)}
															>
																<div className="col-span-2 text-xs text-muted-foreground">
																	{new Date(d.submittedAt).toLocaleTimeString('en-US', { 
																		hour: '2-digit', 
																		minute: '2-digit', 
																		second: '2-digit',
																		hour12: true 
																	})}
																</div>
																<div className="col-span-3 truncate" title={d.moduleTitle}>
																	{d.moduleTitle}
																</div>
																<div className="col-span-2 text-xs text-muted-foreground truncate">
																	{d.username || '—'}
																</div>
																<div className="col-span-5">
																	<div className="text-sm text-foreground truncate" title="Click to view full question">
																		{getQuestionPreview(d.questionText)}
																	</div>
																	<div className="text-xs text-muted-foreground">
																		Answer: {d.userAnswer || '—'}
																	</div>
																</div>
															</div>
														)) : (
															<div className="p-6 text-center text-muted-foreground">No data for this day.</div>
														)}
													</div>
												</div>
											</div>
										</div>
									) : (
										<div className="p-8 text-center text-muted-foreground">No stats for selected date.</div>
									)}
								</ScrollArea>
							</Card>
						</div>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={clearStatsConfirmOpen} onOpenChange={setClearStatsConfirmOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Clear All Stats Data</DialogTitle>
						<DialogDescription>
							This will delete all saved daily stats across all modules. Your modules and questions will not be affected.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setClearStatsConfirmOpen(false)}>Cancel</Button>
						<Button
							variant="destructive"
							onClick={async () => {
								await clearAllDailyStats();
								setStatsDates([]);
								setSelectedDate(new Date().toISOString().slice(0, 10));
								setSummary(null);
								setDayDetails([]);
								setClearStatsConfirmOpen(false);
							}}
						>
							Clear
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
