import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, FileQuestion, Settings, Layers, LogOut, Music, ListMusic, Search, BookOpen, BookText, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { db, normalizeDictionaryWord } from '@/lib/db';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { omniEnsureIndexedOnce, omniSearch } from '@/lib/hybridSearch';
import type { HybridDocType } from '@/lib/hybridPglite';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import AudioPlayer from '@/components/AudioPlayer';
import { prepareContentForDisplay } from '@/lib/contentFormatting';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HOME_ROUTE } from '@/constants/routes';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();

	const [dictModal, setDictModal] = useState<{ word: string; meaning: string } | null>(null);

	useEffect(() => {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		if (!root) return;
		root.classList.toggle('is-admin', !!isAdmin);
	}, [isAdmin]);

	const [omniOpen, setOmniOpen] = useState(false);
	const [omniQuery, setOmniQuery] = useState('');
	const [omniLoading, setOmniLoading] = useState(false);
	const [omniSelectedValue, setOmniSelectedValue] = useState('');
	const [omniResults, setOmniResults] = useState<Array<{ type: HybridDocType; id: string; title: string; subtitle: string; preview: string }>>(
		[],
	);
	const [previewQuestionId, setPreviewQuestionId] = useState<string | null>(null);
	const [previewSongId, setPreviewSongId] = useState<string | null>(null);
	const [hearOpen, setHearOpen] = useState(false);
	const indexedOnceRef = useRef(false);

	const previewQuestion = useLiveQuery(
		() => (previewQuestionId ? db.questions.get(previewQuestionId) : Promise.resolve(undefined)),
		[previewQuestionId],
		undefined,
	);
	const previewSong = useLiveQuery(
		() => (previewSongId ? db.songs.get(previewSongId) : Promise.resolve(undefined)),
		[previewSongId],
		undefined,
	);

	useEffect(() => {
		if (!omniOpen) return;
		setOmniSelectedValue('');
	}, [omniOpen, omniQuery, omniResults.length]);

	const newErrorReportCount = useLiveQuery(
		() => isAdmin ? db.errorReports.where('status').equals('new').count() : Promise.resolve(0),
		[isAdmin],
		0
	);

	useEffect(() => {
		if (typeof window === 'undefined' || typeof document === 'undefined') return;
		const isEditableTarget = (target: EventTarget | null) => {
			if (!(target instanceof HTMLElement)) return false;
			if (target.closest('input, textarea, [contenteditable="true"]')) return true;
			if (target.closest('button, a, [role="button"], [data-radix-collection-item]')) return true;
			return false;
		};
		const isWordChar = (ch: string) => /[a-zA-Z0-9\u0980-\u09FF'-]/.test(ch);
		const extractWordFromPoint = (e: MouseEvent): string => {
			const selection = window.getSelection();
			const selected = selection?.toString()?.trim() ?? '';
			if (selected) return selected;
			const anyDoc: any = document as any;
			let range: Range | null = null;
			if (typeof anyDoc.caretRangeFromPoint === 'function') {
				range = anyDoc.caretRangeFromPoint(e.clientX, e.clientY);
			} else if (typeof anyDoc.caretPositionFromPoint === 'function') {
				const pos = anyDoc.caretPositionFromPoint(e.clientX, e.clientY);
				if (pos) {
					range = document.createRange();
					range.setStart(pos.offsetNode, pos.offset);
					range.setEnd(pos.offsetNode, pos.offset);
				}
			}
			if (!range) return '';
			const node = range.startContainer;
			const offset = range.startOffset;
			if (!(node instanceof Text)) return '';
			const text = node.data ?? '';
			if (!text) return '';
			const idx = Math.min(Math.max(offset, 0), text.length);
			let left = idx;
			let right = idx;
			while (left > 0 && isWordChar(text[left - 1])) left--;
			while (right < text.length && isWordChar(text[right])) right++;
			return text.slice(left, right).trim();
		};
		const onDblClickWordLookup = async (e: MouseEvent) => {
			if (isEditableTarget(e.target)) return;
			const root = document.documentElement;
			if (root?.classList.contains('is-exam') || root?.classList.contains('is-matching-question')) return;
			const word = extractWordFromPoint(e);
			if (!word) return;
			if (word.length > 64) return;
			const normalized = normalizeDictionaryWord(word);
			if (!normalized) return;
			try {
				const matches = await db.customDictionary.where('normalizedWord').equals(normalized).toArray();
				if (!matches.length) return;
				const best = matches[0];
				setDictModal({ word: best.word, meaning: best.meaning });
			} catch {
				// ignore
			}
		};
		document.addEventListener('dblclick', onDblClickWordLookup);
		return () => document.removeEventListener('dblclick', onDblClickWordLookup);
	}, []);

	const openOmniAndFocus = () => {
		setOmniOpen(true);
		window.setTimeout(() => {
			const input = document.querySelector<HTMLInputElement>('input.command-input');
			input?.focus();
		}, 0);
	};

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const isK = e.key.toLowerCase() === 'k';
			const wants = isK && (e.metaKey || e.ctrlKey);
			if (!wants) return;
			e.preventDefault();
			openOmniAndFocus();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, []);

	useEffect(() => {
		if (!omniOpen) return;
		if (!indexedOnceRef.current) {
			indexedOnceRef.current = true;
			void omniEnsureIndexedOnce();
		}
	}, [omniOpen]);

	useEffect(() => {
		const q = omniQuery.trim();
		if (!omniOpen) return;
		if (!q) {
			setOmniResults([]);
			return;
		}
		let alive = true;
		setOmniLoading(true);
		const t = window.setTimeout(() => {
			void (async () => {
					try {
						const res = await omniSearch(q, { limit: 40 });
						if (!alive) return;
						const filtered = res;
						setOmniResults(
							filtered.map((r) => ({ type: r.type, id: r.id, title: r.title, subtitle: r.subtitle, preview: r.preview })),
						);
					} catch (e) {
						console.error(e);
						if (!alive) return;
						setOmniResults([]);
				} finally {
					if (alive) setOmniLoading(false);
				}
			})();
		}, 120);
		return () => {
			alive = false;
			window.clearTimeout(t);
		};
	}, [omniOpen, omniQuery, isAdmin]);

	const songs = useMemo(() => omniResults.filter((r) => r.type === 'song'), [omniResults]);
	const questions = useMemo(() => omniResults.filter((r) => r.type === 'question'), [omniResults]);
	const modules = useMemo(() => omniResults.filter((r) => r.type === 'module'), [omniResults]);
	const courses = useMemo(() => omniResults.filter((r) => r.type === 'course'), [omniResults]);

	const closeOmni = () => {
		setOmniOpen(false);
		setOmniQuery('');
		setOmniResults([]);
		setOmniLoading(false);
	};

  const adminNavigation = [
    { name: 'Home', href: HOME_ROUTE, icon: Home },
		{ name: 'Courses', href: '/stories-admin', icon: BookText },
    { name: 'Questions', href: '/questions', icon: FileQuestion },
    { name: 'Modules', href: '/modules', icon: Layers },
		{ name: 'Songs', href: '/songs-admin', icon: Music },
		{ name: 'Song Modules', href: '/song-modules-admin', icon: ListMusic },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

	const studentNavigation = [
		{ name: 'Stories', href: '/stories', icon: BookText },
		{ name: 'Practice', href: '/practice', icon: BookOpen },
	];

  // Students should not see a Home button or top-level navigation;
  // they are expected to stay within the quiz experience only.

  const navigation = isAdmin ? adminNavigation : studentNavigation;
	const primaryNav = useMemo(() => {
		if (isAdmin) {
			return navigation.filter((n) => ['Home', 'Courses', 'Modules'].includes(n.name));
		}
		return navigation;
	}, [isAdmin, navigation]);
	const moreNav = useMemo(() => {
		if (isAdmin) {
			return navigation.filter((n) => !['Home', 'Courses', 'Modules'].includes(n.name));
		}
		return [] as typeof navigation;
	}, [isAdmin, navigation]);

  const isActive = (path: string) => location.pathname === path;

  const isModuleRunner = location.pathname.startsWith('/module/');
  const isModuleEditor = location.pathname.includes('/modules/') && (location.pathname.includes('/edit') || location.pathname.includes('/new'));
  
  	return (
		<div className={cn("flex flex-col min-h-[100dvh]", isModuleRunner ? "bg-white" : "bg-background")}>
			<Dialog open={!!previewQuestionId} onOpenChange={(open) => { if (!open) setPreviewQuestionId(null); }}>
				<DialogContent className="max-w-4xl">
					<DialogHeader>
						<DialogTitle>{previewQuestion?.code ? `Question ${previewQuestion.code}` : 'Question'}</DialogTitle>
						<DialogDescription>Preview</DialogDescription>
					</DialogHeader>
					<ScrollArea className="max-h-[70vh]">
						<div className="space-y-4 pr-2">
							{previewQuestion ? (
								<div className="prose max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(previewQuestion.text || '') }} />
							) : (
								<div className="text-sm text-muted-foreground">Loading…</div>
							)}
						</div>
					</ScrollArea>
					<DialogFooter>
						<Button variant="outline" onClick={() => setPreviewQuestionId(null)}>Close</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={hearOpen} onOpenChange={(open) => { if (!open) { setHearOpen(false); setPreviewSongId(null); } }}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>{previewSong?.title || 'Hear song'}</DialogTitle>
						<DialogDescription>Audio playback</DialogDescription>
					</DialogHeader>
					{previewSong ? (
						<AudioPlayer src={previewSong.audioFileUrl} trackTitle={previewSong.title || 'Song'} />
					) : (
						<div className="text-sm text-muted-foreground">No song selected.</div>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={() => { setHearOpen(false); setPreviewSongId(null); }}>Close</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

      		<CommandDialog
			open={omniOpen}
			onOpenChange={(open) => {
				setOmniOpen(open);
				if (!open) {
					setOmniQuery('');
					setOmniResults([]);
					setOmniLoading(false);
					setOmniSelectedValue('');
				}
			}}
			commandProps={{ value: omniSelectedValue, onValueChange: setOmniSelectedValue }}
		>
			<CommandInput
				placeholder={isAdmin ? 'Search songs, questions, modules, courses…' : 'Search songs and courses…'}
				className="command-input"
				value={omniQuery}
				onValueChange={setOmniQuery}
			/>
			<CommandList>
				<CommandEmpty>{omniLoading ? 'Searching…' : 'No results.'}</CommandEmpty>
				{songs.length ? (
					<CommandGroup heading="Songs">
						{songs.map((r) => (
							<CommandItem
								key={`song-${r.id}`}
								value={`${r.title} ${r.subtitle}`}
								onSelect={() => {
									closeOmni();
									setPreviewSongId(r.id);
									setHearOpen(true);
								}}
							>
								<Search className="mr-2 h-4 w-4" />
								<div className="min-w-0 flex-1">
									<div className="truncate">{r.title}</div>
									{r.preview ? <div className="truncate text-xs text-muted-foreground">{r.preview}</div> : null}
								</div>
								<Button
									variant="outline"
									size="sm"
									className="ml-2 bg-background text-foreground border-border/70 hover:bg-primary/10 hover:text-foreground hover:border-primary/40"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										closeOmni();
										setPreviewSongId(r.id);
										setHearOpen(true);
									}}
								>
									View
								</Button>
							</CommandItem>
						))}
					</CommandGroup>
				) : null}
				{isAdmin && questions.length ? (
					<CommandGroup heading="Questions">
						{questions.map((r) => (
							<CommandItem
								key={`question-${r.id}`}
								value={`${r.title} ${r.subtitle}`}
								onSelect={() => {
									closeOmni();
									setPreviewQuestionId(r.id);
								}}
							>
								<Search className="mr-2 h-4 w-4" />
								<div className="min-w-0 flex-1">
									<div className="truncate">{r.title}</div>
									{r.preview ? <div className="truncate text-xs text-muted-foreground">{r.preview}</div> : null}
								</div>
								<Button
									variant="outline"
									size="sm"
									className="ml-2 bg-background text-foreground border-border/70 hover:bg-primary/10 hover:text-foreground hover:border-primary/40"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										closeOmni();
										setPreviewQuestionId(r.id);
									}}
								>
									View
								</Button>
							</CommandItem>
						))}
					</CommandGroup>
				) : null}
				{isAdmin && modules.length ? (
					<CommandGroup heading="Modules">
						{modules.map((r) => (
							<CommandItem
								key={`module-${r.id}`}
								value={`${r.title} ${r.subtitle}`}
								onSelect={() => {
									closeOmni();
									navigate(`/modules?highlight=${encodeURIComponent(r.id)}`);
								}}
							>
								<Search className="mr-2 h-4 w-4" />
								<div className="min-w-0 flex-1">
									<div className="truncate">{r.title}</div>
									{r.preview ? <div className="truncate text-xs text-muted-foreground">{r.preview}</div> : null}
								</div>
								<Button
									variant="outline"
									size="sm"
									className="ml-2 bg-background text-foreground border-border/70 hover:bg-primary/10 hover:text-foreground hover:border-primary/40"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										closeOmni();
										navigate(`/modules?highlight=${encodeURIComponent(r.id)}`);
									}}
								>
									Go
								</Button>
							</CommandItem>
						))}
					</CommandGroup>
				) : null}
				{courses.length ? (
					<CommandGroup heading="Courses">
						{courses.map((r) => (
							<CommandItem
								key={`course-${r.id}`}
								value={`${r.title} ${r.subtitle}`}
								onSelect={() => {
									closeOmni();
									navigate(`${isAdmin ? '/stories-admin' : '/stories'}?highlight=${encodeURIComponent(r.id)}`);
								}}
							>
								<Search className="mr-2 h-4 w-4" />
								<div className="min-w-0 flex-1">
									<div className="truncate">{r.title}</div>
									{r.preview ? <div className="truncate text-xs text-muted-foreground">{r.preview}</div> : null}
								</div>
								<Button
									variant="outline"
									size="sm"
									className="ml-2 bg-background text-foreground border-border/70 hover:bg-primary/10 hover:text-foreground hover:border-primary/40"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										closeOmni();
										navigate(`${isAdmin ? '/stories-admin' : '/stories'}?highlight=${encodeURIComponent(r.id)}`);
									}}
								>
									Go
								</Button>
							</CommandItem>
						))}
					</CommandGroup>
				) : null}
			</CommandList>
		</CommandDialog>

		<Dialog open={!!dictModal} onOpenChange={(open) => (!open ? setDictModal(null) : null)}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{dictModal?.word ?? 'Meaning'}</DialogTitle>
					<DialogDescription>
						{dictModal?.meaning ?? ''}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => setDictModal(null)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
      {/* Top Navigation */}
      <header className="z-40 border-b border-border/70 bg-gradient-to-r from-primary via-accent to-primary text-primary-foreground shadow-sm backdrop-blur supports-[backdrop-filter]:bg-opacity-90">
        <div className="max-w-7xl mx-auto h-16 md:h-18 px-3 md:px-4 flex items-center justify-between">
          									{/* Left: logo / brand */}
									<div className="flex items-center gap-2">
										<Link to={HOME_ROUTE} className="flex items-center gap-2">
																	<span className="tk-logo-font tk-navbar-wordmark tk-logo-interactive text-lg md:text-3xl font-black tracking-tight" aria-label="MathInk">
																		<span className="tk-navbar-wordmark-letter">M</span>
																		<span className="tk-navbar-wordmark-letter">a</span>
																		<span className="tk-navbar-wordmark-letter">t</span>
																		<span className="tk-navbar-wordmark-letter">h</span>
																		<span className="tk-navbar-wordmark-letter">I</span>
																		<span className="tk-navbar-wordmark-letter">n</span>
																		<span className="tk-navbar-wordmark-letter">k</span>
																	</span>
										</Link>
									</div>

          {/* Right: primary navigation and user info */}
          <div className="flex items-center gap-2">
            {primaryNav.length > 0 ? (
              <nav className="flex items-center gap-1 rounded-lg bg-black/10 border border-white/15 px-1.5 md:px-2.5 py-1.5 shadow-sm">
                {primaryNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <TooltipProvider key={item.name}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            to={item.href}
                            className={cn(
                              'inline-flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-2 rounded-md text-xs md:text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-0',
                              isActive(item.href)
                                ? 'bg-white/95 text-foreground shadow-sm'
                                : 'text-white/85 hover:bg-white/12 hover:text-white active:bg-white/15',
                            )}
                          >
                            <span className="relative inline-flex">
                              <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                            </span>
                            <span className="hidden sm:inline">{item.name}</span>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>{item.name}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}

                {isAdmin && moreNav.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="More"
                        className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs md:text-sm font-medium text-white/85 hover:bg-white/12 hover:text-white active:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                      >
                        <LayoutGrid className="h-4 w-4" />
                        <span className="hidden sm:inline">More</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[200px]">
                      {moreNav.map((item) => {
                        const Icon = item.icon;
                        const showErrorBadge = item.name === 'Settings' && (newErrorReportCount ?? 0) > 0;
                        return (
                          <DropdownMenuItem
                            key={item.name}
                            onSelect={() => navigate(item.href)}
                            className={cn(isActive(item.href) && 'bg-accent text-accent-foreground')}
                          >
                            <span className="relative inline-flex mr-2">
                              <Icon className="h-4 w-4" />
                              {showErrorBadge ? (
                                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-4 text-center">
                                  {Math.min(99, newErrorReportCount ?? 0)}
                                </span>
                              ) : null}
                            </span>
                            <span>{item.name}</span>
                          </DropdownMenuItem>
                        );
                      })}

                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={openOmniAndFocus}>
                        <Search className="h-4 w-4 mr-2" />
                        Search
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </nav>
            ) : null}

            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-white/20">
                <span className="text-xs text-white/80 hidden md:inline">{user.username}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={logout}
                        className="text-white/80 hover:text-white hover:bg-white/10"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Logout</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* Page content */}
		<main className={cn("flex-1", isModuleRunner && "bg-white")}> 
        <div className={cn(
          "max-w-7xl mx-auto p-4 md:p-6 tk-fade-in",
          isModuleRunner && "bg-white",
          isModuleEditor && ""
        )}>
          {children}
        </div>
      </main>
    </div>
  );
}
