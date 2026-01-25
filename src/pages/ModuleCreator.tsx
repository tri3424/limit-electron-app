import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HOME_ROUTE } from '@/constants/routes';
import { db } from '@/lib/db';
import type { Tag, Question } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useQuestions } from '@/hooks/useQuestions';
import { createModule } from '@/lib/modules';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { CustomDatePicker } from '@/components/CustomDatePicker';
import { CustomTimePicker } from '@/components/CustomTimePicker';
import { TruncatedQuestionText } from '@/components/TruncatedQuestionText';
import { MatchingQuestionView } from '@/components/MatchingQuestionView';
import { prepareContentForDisplay } from '@/lib/contentFormatting';

function parseLocalDateAndTime(date: string, time: string): number {
	if (!date || !time) return NaN;
	const [year, month, day] = date.split('-').map(part => parseInt(part, 10));
	const [hours, minutes] = time.split(':').map(part => parseInt(part, 10));
	if ([year, month, day, hours, minutes].some(value => Number.isNaN(value))) {
		return NaN;
	}
	const local = new Date(year, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0, 0, 0);
	return local.getTime();
}

function formatTimeFromDate(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ModuleCreator() {
	const navigate = useNavigate();
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [type, setType] = useState<'exam' | 'practice'>('practice');
	const [tags, setTags] = useState<string[]>([]);
	const [questionIds, setQuestionIds] = useState<string[]>([]);
	const [timerType, setTimerType] = useState<'perQuestion' | 'perModule' | 'none'>('none');
	const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(30);
	const [randomizeQuestions, setRandomizeQuestions] = useState(false);
	const [allowBackNavigation, setAllowBackNavigation] = useState(true);
	const [showInstantFeedback, setShowInstantFeedback] = useState(true);
	const [autoSubmitOnFocusLoss, setAutoSubmitOnFocusLoss] = useState(true);
	const [requireFullscreen, setRequireFullscreen] = useState(true);
	const [glossaryHintsEnabled, setGlossaryHintsEnabled] = useState(true);
	const [allowReview, setAllowReview] = useState(false);
	const [reviewDurationMinutes, setReviewDurationMinutes] = useState<number>(5);
	const [examDate, setExamDate] = useState('');
	const [examStartTime, setExamStartTime] = useState('');
	const [examEndTime, setExamEndTime] = useState('');
	const [dailyLimitEnabled, setDailyLimitEnabled] = useState(false);
	const [dailyLimitMax, setDailyLimitMax] = useState<number>(50);
	const [allowedDaysOfWeek, setAllowedDaysOfWeek] = useState<number[]>([]);
	const [availabilityStartTime, setAvailabilityStartTime] = useState('');
	const [availabilityEndTime, setAvailabilityEndTime] = useState('');

	const [availableTags, setAvailableTags] = useState<Tag[]>([]);
	useEffect(() => {
		db.tags.toArray().then(setAvailableTags);
	}, []);

	// Adjust defaults based on type (review is no longer supported)
	useEffect(() => {
		if (type === 'exam') {
			setAllowBackNavigation(false);
			setShowInstantFeedback(false);
			setAutoSubmitOnFocusLoss(true);
			setRequireFullscreen(false);
			setTimerType('perModule');
		} else {
			// Practice defaults: no timer, no exam integrity requirements.
			// Back navigation and instant feedback are always enabled for practice
			// modules and are no longer configurable in the UI.
			setAllowBackNavigation(true);
			setShowInstantFeedback(true);
			setAutoSubmitOnFocusLoss(false);
			setRequireFullscreen(false);
			setTimerType('none');
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [type]);

	useEffect(() => {
		if (type !== 'exam') return;
		if (!examDate || !examStartTime) return;
		if (!timeLimitMinutes || timeLimitMinutes <= 0) return;
		const startMs = parseLocalDateAndTime(examDate, examStartTime);
		if (Number.isNaN(startMs)) return;
		const endLocal = new Date(startMs + timeLimitMinutes * 60000);
		const nextEnd = formatTimeFromDate(endLocal);
		setExamEndTime(nextEnd);
	}, [type, examDate, examStartTime, timeLimitMinutes]);

	// Question filters
	const [filterType, setFilterType] = useState<'mcq' | 'text' | 'fill_blanks' | 'matching' | undefined>(undefined);
	const [filterSearch, setFilterSearch] = useState('');
	const [searchInput, setSearchInput] = useState('');
	const [filterTags, setFilterTags] = useState<string[]>([]);
	const clearQuestionFilters = () => {
		setFilterType(undefined);
		setFilterSearch('');
		setSearchInput('');
		setFilterTags([]);
		setShowOnlySelected(false);
	};

	useEffect(() => {
		const t = window.setTimeout(() => {
			setFilterSearch(searchInput);
		}, 180);
		return () => window.clearTimeout(t);
	}, [searchInput]);
	const questions = useQuestions({
		type: filterType,
		search: filterSearch,
		tags: filterTags,
	});
	const [showOnlySelected, setShowOnlySelected] = useState(false);
	const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'type'>('newest');
	const [openQuestion, setOpenQuestion] = useState<Question | null>(null);

	const displayedQuestions = useMemo(() => {
		let list = questions || [];
		if (showOnlySelected) list = list.filter(q => questionIds.includes(q.id));
		if (sortBy === 'newest') list = list.slice().sort((a, b) => (b.metadata?.createdAt || 0) - (a.metadata?.createdAt || 0));
		if (sortBy === 'oldest') list = list.slice().sort((a, b) => (a.metadata?.createdAt || 0) - (b.metadata?.createdAt || 0));
		if (sortBy === 'type') list = list.slice().sort((a, b) => a.type.localeCompare(b.type));
		return list;
	}, [questions, showOnlySelected, sortBy, questionIds]);

	const allSelected = useMemo(
		() => displayedQuestions?.length && questionIds.length && displayedQuestions.every(q => questionIds.includes(q.id)),
		[displayedQuestions, questionIds]
	);

	const toggleSelectAll = () => {
		const list = displayedQuestions || [];
		if (!list.length) return;
		if (allSelected) {
			const remaining = questionIds.filter(id => !list.some(q => q.id === id));
			setQuestionIds(remaining);
		} else {
			const ids = Array.from(new Set([...questionIds, ...list.map(q => q.id)]));
			setQuestionIds(ids);
		}
	};

	const selectVisible = () => {
		const list = displayedQuestions || [];
		if (!list.length) return;
		setQuestionIds(prev => Array.from(new Set([...prev, ...list.map(q => q.id)])));
	};

	const unselectVisible = () => {
		const list = displayedQuestions || [];
		if (!list.length) return;
		const visibleIds = new Set(list.map(q => q.id));
		setQuestionIds(prev => prev.filter(id => !visibleIds.has(id)));
	};

	const visibleSelectedCount = useMemo(() => {
		const list = displayedQuestions || [];
		if (!list.length || !questionIds.length) return 0;
		let n = 0;
		for (const q of list) {
			if (questionIds.includes(q.id)) n++;
		}
		return n;
	}, [displayedQuestions, questionIds]);

	const handleSubmit = async () => {
		if (!title.trim()) {
			toast({ title: 'Validation', description: 'Title is required', variant: 'destructive' });
			return;
		}
		if (type === 'exam' && (!timeLimitMinutes || timeLimitMinutes <= 0)) {
			toast({ title: 'Validation', description: 'Exam requires a time limit', variant: 'destructive' });
			return;
		}
		let scheduledStartUtc: number | undefined;
		let scheduledEndUtc: number | undefined;
		if (type === 'exam') {
			if (!examDate || !examStartTime || !examEndTime) {
				toast({ title: 'Validation', description: 'Exam start and end date/time are required for exams', variant: 'destructive' });
				return;
			}
			const startMs = parseLocalDateAndTime(examDate, examStartTime);
			const endMs = parseLocalDateAndTime(examDate, examEndTime);
			if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
				toast({ title: 'Validation', description: 'Invalid exam date or time', variant: 'destructive' });
				return;
			}
			if (endMs <= startMs) {
				toast({ title: 'Validation', description: 'Exam end time must be after start time', variant: 'destructive' });
				return;
			}
			scheduledStartUtc = startMs;
			scheduledEndUtc = endMs;
		}
		try {
			const parseTimeToMinutes = (time: string): number | null => {
				if (!time) return null;
				const [hh, mm] = time.split(':').map((v) => parseInt(v, 10));
				if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
				return hh * 60 + mm;
			};

			const startMinutes = parseTimeToMinutes(availabilityStartTime);
			const endMinutes = parseTimeToMinutes(availabilityEndTime);
			let allowedTimeWindow: { startMinutes: number; endMinutes: number } | undefined;

			if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) {
				allowedTimeWindow = { startMinutes, endMinutes };
			}

			const effectiveTimerType: 'perModule' | 'perQuestion' | 'none' = type === 'exam' ? 'perModule' : 'none';
			const settings = {
				randomizeQuestions,
				allowReview: type === 'exam' ? allowReview : false,
				timerType: effectiveTimerType,
				timeLimitMinutes: effectiveTimerType === 'none' ? undefined : timeLimitMinutes,
				autoSubmitOnFocusLoss: false, // Removed checkbox - always false
				allowBackNavigation,
				showInstantFeedback,
				requireFullscreen,
				reviewDurationSeconds: (type === 'exam' && allowReview && reviewDurationMinutes > 0) ? reviewDurationMinutes * 60 : undefined,
				dailyLimit: dailyLimitEnabled ? {
					enabled: true,
					maxQuestionsPerDay: dailyLimitMax,
				} : undefined,
				glossaryHints: glossaryHintsEnabled,
				allowedDaysOfWeek: allowedDaysOfWeek.length ? allowedDaysOfWeek : undefined,
				allowedTimeWindow,
			};
			await createModule({
				title,
				description,
				type,
				tags,
				questionIds,
				settings,
				scheduledStartUtc,
				scheduledEndUtc,
			});
			toast({ title: 'Module created' });
			navigate(HOME_ROUTE);
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : 'Failed to create module';
			toast({ title: 'Error', description: message, variant: 'destructive' });
		}
	};

	return (
		<div className="max-w-7xl mx-auto space-y-6 pb-6 min-h-0">
			<div className="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-background/90 backdrop-blur border-b border-border/60">
				<div className="flex items-center justify-between">
					<h1 className="text-2xl font-semibold">Create Module</h1>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
						<Button onClick={handleSubmit}>Save Module</Button>
					</div>
				</div>
			</div>

		<div className="pr-2">
			<div className="grid grid-cols-12 gap-6">
				<Card className="p-6 col-span-12 space-y-6">
					<div className="flex flex-col gap-1">
						<h2 className="text-lg font-semibold text-foreground">Module details</h2>
						<p className="text-sm text-muted-foreground">
							Set the title, type, and tags before selecting questions.
						</p>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
						<div className="lg:col-span-2 space-y-4">
							<div className="space-y-2">
								<Label>Title</Label>
								<Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Module title" />
								<p className="text-xs text-muted-foreground">Short and descriptive, e.g. “Fractions Practice – Week 2”.</p>
							</div>
							<div className="space-y-2">
								<Label>Instructions (optional)</Label>
								<Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
								<p className="text-xs text-muted-foreground">Shown to students at the start of the module.</p>
							</div>
						</div>

						<div className="space-y-4">
							<div className="space-y-2">
								<Label>Type</Label>
								<Select value={type} onValueChange={(v: 'exam' | 'practice') => setType(v)}>
									<SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
									<SelectContent>
										<SelectItem value="practice">Practice</SelectItem>
										<SelectItem value="exam">Exam</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">Exam enables scheduling and a required time limit.</p>
							</div>

							{type === 'exam' && (
								<div className="space-y-2">
									<Label>Time Limit (minutes)</Label>
									<Input type="number" min={1} value={timeLimitMinutes} onChange={e => setTimeLimitMinutes(parseInt(e.target.value || '0', 10))} />
									<p className="text-xs text-muted-foreground">Students must finish within this time.</p>
								</div>
							)}
						</div>
					</div>

					<div className="space-y-2">
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
							<Label>Tags</Label>
							<span className="text-xs text-muted-foreground">Selected: {tags.length}</span>
						</div>
						<div className="rounded-lg border bg-muted/20 p-3">
							<div className="flex flex-wrap gap-2">
								{availableTags.map(t => {
									const selected = tags.includes(t.name);
									return (
										<button
											key={t.id}
											type="button"
											className="transition-opacity hover:opacity-90"
											onClick={() => {
												setTags(prev => selected ? prev.filter(x => x !== t.name) : [...prev, t.name]);
											}}
										>
											<Badge variant={selected ? 'default' : 'secondary'}>{t.name}</Badge>
										</button>
									);
								})}
							</div>
							<p className="mt-2 text-xs text-muted-foreground">Click tags to toggle. Used for organizing modules on the home page.</p>
						</div>
					</div>


					{type === 'exam' && (
						<div className="mt-4 border rounded-lg p-4 space-y-3 bg-muted/30">
							<div className="flex items-center justify-between">
								<Label className="text-base font-semibold">Exam Schedule</Label>
								<span className="text-xs text-muted-foreground">All times are in your local timezone</span>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
								<div className="space-y-1">
									<Label className="text-xs uppercase tracking-wide text-muted-foreground">Date</Label>
									<CustomDatePicker
										value={examDate || undefined}
										onChange={date => setExamDate(date)}
										placeholder="Select date"
									/>
								</div>
								<div className="space-y-1">
									<Label className="text-xs uppercase tracking-wide text-muted-foreground">Start time</Label>
									<CustomTimePicker
										value={examStartTime || ''}
										onChange={time => setExamStartTime(time)}
										placeholder="Select start time"
									/>
								</div>
								<div className="space-y-1">
									<Label className="text-xs uppercase tracking-wide text-muted-foreground">End time</Label>
									<CustomTimePicker
										value={examEndTime || ''}
										onChange={time => setExamEndTime(time)}
										placeholder="Select end time"
									/>
								</div>
							</div>
							<p className="text-xs text-muted-foreground">Exam modules will appear on the home page 5 minutes before the start time and will no longer be startable after the end time.</p>
						</div>
					)}

					{type === 'practice' && (
						<div className="space-y-4 border rounded-lg p-4 bg-muted/30">
							<div className="flex items-center justify-between">
								<Label className="text-base font-semibold">Daily Question Limit</Label>
								<span className="text-xs text-muted-foreground">Limit questions per day for this module</span>
							</div>
							<div className="space-y-3">
								<div className="flex items-center space-x-2">
									<Checkbox 
										checked={dailyLimitEnabled} 
										onCheckedChange={(v: CheckedState) => setDailyLimitEnabled(v === true)} 
									/>
									<Label>Enable daily limit for this module</Label>
								</div>
								{dailyLimitEnabled && (
									<div className="space-y-2 pl-6">
										<Label className="text-sm">Maximum questions per day</Label>
										<Input
											type="number"
											min={1}
											value={dailyLimitMax}
											onChange={(e) => setDailyLimitMax(parseInt(e.target.value || '50', 10))}
											className="max-w-xs"
										/>
										<p className="text-xs text-muted-foreground">
											Once this limit is reached, users will not be able to answer more questions from this module today
										</p>
									</div>
								)}
							</div>
						</div>
					)}

					{type === 'practice' && (
						<div className="space-y-4 border rounded-lg p-4 bg-muted/20">
							<div className="flex items-center justify-between">
								<Label className="text-base font-semibold">Availability window</Label>
								<span className="text-xs text-muted-foreground">
									Optional: restrict module access to specific days and times
								</span>
							</div>
							<div className="space-y-3">
								<div className="space-y-1">
									<Label className="text-xs uppercase tracking-wide text-muted-foreground">
										Days of the week
									</Label>
									<div className="flex flex-wrap gap-1.5">
										{[
											{ label: 'Sun', value: 0 },
											{ label: 'Mon', value: 1 },
											{ label: 'Tue', value: 2 },
											{ label: 'Wed', value: 3 },
											{ label: 'Thu', value: 4 },
											{ label: 'Fri', value: 5 },
											{ label: 'Sat', value: 6 },
										].map((d) => {
											const active = allowedDaysOfWeek.includes(d.value);
											return (
												<button
													key={d.value}
													type="button"
													onClick={() =>
														setAllowedDaysOfWeek((prev) =>
															prev.includes(d.value)
																? prev.filter((v) => v !== d.value)
																: [...prev, d.value]
														)
													}
													className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
														active
															? 'bg-emerald-600 text-white border-emerald-600'
															: 'bg-background text-muted-foreground border-border hover:bg-muted/60'
													}`}
												>
													{d.label}
												</button>
											);
										})}
									</div>
									<p className="text-[11px] text-muted-foreground">
										If no days are selected, the module is available every day.
									</p>
								</div>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<div className="space-y-1">
										<Label className="text-xs uppercase tracking-wide text-muted-foreground">
											Earliest access time
										</Label>
										<CustomTimePicker
											value={availabilityStartTime}
											onChange={setAvailabilityStartTime}
											placeholder="Any time"
										/>
									</div>
									<div className="space-y-1">
										<Label className="text-xs uppercase tracking-wide text-muted-foreground">
											Latest access time
										</Label>
										<CustomTimePicker
											value={availabilityEndTime}
											onChange={setAvailabilityEndTime}
											placeholder="Any time"
										/>
									</div>
								</div>
								<p className="text-[11px] text-muted-foreground">
									If no times are set or the range is invalid, the module is available all day.
								</p>
							</div>
						</div>
					)}

					<div className="grid grid-cols-2 gap-4">
						<div className="flex items-center space-x-2">
							<Checkbox checked={randomizeQuestions} onCheckedChange={(v: CheckedState) => setRandomizeQuestions(v === true)} />
							<Label>Randomize questions</Label>
						</div>
						{/* Practice modules always allow back navigation and instant feedback;
              those options are no longer exposed in the UI. */}
						{type === 'exam' && (
							<>
								<div className="flex items-start space-x-2 col-span-2">
									<Checkbox checked={allowReview} onCheckedChange={(v: CheckedState) => setAllowReview(v === true)} />
									<div className="flex-1">
										<Label>Enable review phase</Label>
										<p className="text-xs text-muted-foreground">
											Allow students to review their answers after the exam ends.
										</p>
									</div>
								</div>
								{allowReview && (
									<div className="col-span-2 space-y-1">
										<Label className="text-xs uppercase tracking-wide text-muted-foreground">
											Review duration (minutes)
										</Label>
										<Input
											type="number"
											min="1"
											value={reviewDurationMinutes}
											onChange={(e) => {
												const value = parseInt(e.target.value || '0', 10);
												setReviewDurationMinutes(value > 0 ? value : 5);
											}}
											placeholder="Enter duration in minutes"
											className="w-full"
										/>
										<p className="text-[11px] text-muted-foreground">
											Enter the number of minutes students can review their answers after the exam ends.
										</p>
									</div>
								)}
							</>
						)}
						<div className="flex items-start space-x-2 col-span-2">
							<Checkbox checked={glossaryHintsEnabled} onCheckedChange={(v: CheckedState) => setGlossaryHintsEnabled(v === true)} />
							<div>
								<Label>Enable glossary hints</Label>
								<p className="text-xs text-muted-foreground">
									Allow learners to double-click glossary words during this module to view their meanings.
								</p>
							</div>
						</div>
					</div>
				</Card>

				<Card className="p-6 col-span-12 space-y-4 flex flex-col min-h-0 max-h-[80vh] overflow-hidden">
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
						<div className="space-y-0.5">
							<h3 className="font-medium">Select Questions</h3>
							<div className="text-xs text-muted-foreground">
								Showing <span className="font-medium text-foreground">{displayedQuestions?.length ?? 0}</span>
								{' '}· Visible selected <span className="font-medium text-foreground">{visibleSelectedCount}</span>
								{' '}· Total selected <span className="font-medium text-foreground">{questionIds.length}</span>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground justify-end">
							<Button
								variant="outline"
								size="sm"
								disabled={!displayedQuestions || displayedQuestions.length === 0 || allSelected === true}
								onClick={selectVisible}
							>
								Select visible
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={!displayedQuestions || displayedQuestions.length === 0 || visibleSelectedCount === 0}
								onClick={unselectVisible}
							>
								Unselect visible
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={!filterType && !filterTags.length && !searchInput.trim() && showOnlySelected !== true}
								onClick={clearQuestionFilters}
							>
								Clear filters
							</Button>
						</div>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
						<Select
							value={filterType ?? 'all'}
							onValueChange={(v) =>
								setFilterType(v === 'all' ? undefined : (v as 'mcq' | 'text' | 'fill_blanks' | 'matching'))
							}
						>
							<SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All</SelectItem>
								<SelectItem value="mcq">MCQ</SelectItem>
								<SelectItem value="text">Text</SelectItem>
								<SelectItem value="fill_blanks">Fill Blanks</SelectItem>
								<SelectItem value="matching">Matching</SelectItem>
							</SelectContent>
						</Select>
						<Input placeholder="Search code or question text..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
						<Select onValueChange={(v) => {
							if (!v) return;
							setFilterTags(prev => prev.includes(v) ? prev : [...prev, v]);
						}}>
							<SelectTrigger><SelectValue placeholder="Filter by tag" /></SelectTrigger>
							<SelectContent>
								{availableTags.map(t => (
									<SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select value={sortBy} onValueChange={(v: 'newest' | 'oldest' | 'type') => setSortBy(v)}>
							<SelectTrigger><SelectValue placeholder="Sort" /></SelectTrigger>
							<SelectContent>
								<SelectItem value="newest">Newest</SelectItem>
								<SelectItem value="oldest">Oldest</SelectItem>
								<SelectItem value="type">Type</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{filterTags.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{filterTags.map(t => (
								<Badge key={t} variant="secondary" onClick={() => setFilterTags(prev => prev.filter(x => x !== t))}>{t} ✕</Badge>
							))}
						</div>
					)}
					<div className="flex items-center justify-between pt-1">
						<label className="flex items-center gap-2 text-sm text-muted-foreground">
							<Checkbox checked={showOnlySelected} onCheckedChange={(v: CheckedState) => setShowOnlySelected(v === true)} />
							<span>Show only selected</span>
						</label>
					</div>
					<div className="border rounded-md flex-1 min-h-0 overflow-auto overscroll-contain divide-y pb-2 show-scrollbar">
						{(!displayedQuestions || displayedQuestions.length === 0) && (
							<div className="p-4 text-sm text-muted-foreground space-y-2">
								<div>No questions match your current filters.</div>
								<Button size="sm" variant="outline" onClick={clearQuestionFilters}>Clear filters</Button>
							</div>
						)}
						{displayedQuestions?.map(q => {
							const selected = questionIds.includes(q.id);
							return (
								<label
									key={q.id}
									className={
										"flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors " +
										(selected ? 'bg-primary/5' : '')
									}
								>
									<Checkbox
										checked={selected}
										onCheckedChange={(v: CheckedState) => {
											setQuestionIds((prev) =>
												v === true
													? Array.from(new Set([...prev, q.id]))
													: prev.filter((id) => id !== q.id)
											);
									}}
									/>
									<div className="space-y-1 flex-1 min-w-0">
										<TruncatedQuestionText html={q.text} questionType={q.type} />
										<div className="text-xs text-muted-foreground flex flex-wrap gap-2">
											{q.code ? (
												<span className="rounded-full border bg-muted/30 px-2 py-0.5 font-mono text-[11px] text-foreground">
													{q.code}
												</span>
											) : null}
											<Badge variant="outline">{q.type.toUpperCase()}</Badge>
											{q.tags.slice(0, 3).map(t => <Badge key={t} variant="secondary">{t}</Badge>)}
										</div>
									</div>
									<div className="pl-2">
										<Button size="sm" variant="outline" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenQuestion(q); }}>View</Button>
									</div>
								</label>
							);
						})}
					</div>
				</Card>

				{/* Question Details Modal */}
				<Dialog open={!!openQuestion} onOpenChange={(open) => { if (!open) setOpenQuestion(null); }}>
					<DialogContent className="max-w-3xl">
						<DialogHeader>
							<DialogTitle>Question Details</DialogTitle>
						</DialogHeader>
						{openQuestion ? (
							<ScrollArea className="h-[70vh]">
								<div className="space-y-4 pr-2">
									<div>
										<div className="text-xs text-muted-foreground mb-1">Type</div>
										<div className="font-medium">{openQuestion.type.toUpperCase()}</div>
									</div>
									<div>
										<div className="text-xs text-muted-foreground mb-1">Question</div>
										<div className="prose max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(openQuestion.text) }} />
									</div>
									{openQuestion.type === 'mcq' && (
										<div>
											<div className="text-xs text-muted-foreground mb-1">Options</div>
											<div className="grid gap-2">
												{(openQuestion.options || []).map((o) => {
													const isCorrect = Array.isArray(openQuestion.correctAnswers) && openQuestion.correctAnswers.includes(o.id);
													return (
														<div key={o.id} className={`rounded-md border p-2 ${isCorrect ? 'border-green-500 bg-green-50' : ''}`}>
															<div className="text-sm content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(o.text) }} />
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
												{openQuestion.tags.map((t: string) => (<Badge key={t} variant="secondary">{t}</Badge>))}
											</div>
										</div>
									)}
								</div>
							</ScrollArea>
						) : null}
					</DialogContent>
				</Dialog>
				</div>
			</div>
		</div>
	);
}

