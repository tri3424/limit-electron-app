import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, FileQuestion, Settings, Layers, LogOut, Music, ListMusic, Search, BookOpen, BookText, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { hybridEnsureIndexedOnce, hybridSearch } from '@/lib/hybridSearch';
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

	useEffect(() => {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		if (!root) return;
		root.classList.toggle('is-admin', !!isAdmin);
	}, [isAdmin]);

	const [omniOpen, setOmniOpen] = useState(false);
	const [omniQuery, setOmniQuery] = useState('');
	const [omniLoading, setOmniLoading] = useState(false);
	const [omniResults, setOmniResults] = useState<Array<{ type: 'song' | 'question'; id: string; title: string; subtitle: string; preview: string }>>(
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

	const newErrorReportCount = useLiveQuery(
		() => isAdmin ? db.errorReports.where('status').equals('new').count() : Promise.resolve(0),
		[isAdmin],
		0
	);

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
			void hybridEnsureIndexedOnce().catch((e) => console.error(e));
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
						const res = await hybridSearch(q, { limit: 40 });
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

	const closeOmni = () => {
		setOmniOpen(false);
		setOmniQuery('');
		setOmniResults([]);
		setOmniLoading(false);
	};

	const logoSrc = `${import.meta.env.BASE_URL}favicon.ico`;

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

			<Dialog open={!!previewSongId} onOpenChange={(open) => { if (!open) { setPreviewSongId(null); setHearOpen(false); } }}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>{previewSong?.title || 'Song'}</DialogTitle>
						<DialogDescription>{previewSong?.singer ? `Singer: ${previewSong.singer}` : 'Preview'}</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						{previewSong?.lyrics ? (
							<div className="whitespace-pre-wrap border rounded-md bg-muted/30 p-4 text-sm leading-relaxed max-h-[40vh] overflow-y-auto overflow-x-hidden">
								{previewSong.lyrics}
							</div>
						) : (
							<div className="text-sm text-muted-foreground">No lyrics.</div>
						)}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setPreviewSongId(null)}>Close</Button>
						<Button onClick={() => setHearOpen(true)} disabled={!previewSong}>Hear</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={hearOpen} onOpenChange={(open) => { if (!open) setHearOpen(false); }}>
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
						<Button variant="outline" onClick={() => setHearOpen(false)}>Close</Button>
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
				}
			}}
		>
			<CommandInput
				placeholder={isAdmin ? 'Search songs and questions…' : 'Search songs…'}
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
									className="ml-2"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										closeOmni();
										setPreviewSongId(r.id);
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
									className="ml-2"
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
			</CommandList>
		</CommandDialog>
      {/* Top Navigation */}
      <header className="z-40 border-b border-border/70 bg-gradient-to-r from-primary via-accent to-primary text-primary-foreground shadow-sm backdrop-blur supports-[backdrop-filter]:bg-opacity-90">
        <div className="max-w-7xl mx-auto h-16 md:h-18 px-3 md:px-4 flex items-center justify-between">
          {/* Left: logo / brand */}
          <div className="flex items-center gap-2">
            <Link to={HOME_ROUTE} className="flex items-center gap-2">
              <img
                src={logoSrc}
                alt="Limit logo"
                className="h-7 w-7 md:h-8 md:w-8 rounded"
              />
              <span className="text-xl md:text-2xl font-semibold tracking-tight">Limit</span>
            </Link>
          </div>

          {/* Right: primary navigation and user info */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-10 px-4 bg-primary/90 border-0 text-primary-foreground hover:bg-primary shadow-sm"
              onClick={openOmniAndFocus}
            >
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            {primaryNav.length > 0 ? (
              <nav className="flex items-center gap-1 rounded-full bg-black/10 px-1 md:px-2 py-1">
                {primaryNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <TooltipProvider key={item.name}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            to={item.href}
                            className={cn(
                              'inline-flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-200 ease-out',
                              isActive(item.href)
                                ? 'bg-white/95 text-foreground shadow-sm'
                                : 'text-white/85 hover:bg-white/10 hover:text-white',
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
                        className="text-white/85 hover:bg-white/10 hover:text-white rounded-full"
                      >
                        <MoreHorizontal className="h-4 w-4" />
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
