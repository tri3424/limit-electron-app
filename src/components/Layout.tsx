import { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation } from 'react-router-dom';
import { Home, FileQuestion, Settings, Layers, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';
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
  const { user, logout, isAdmin } = useAuth();

	const newErrorReportCount = useLiveQuery(
		() => isAdmin ? db.errorReports.where('status').equals('new').count() : Promise.resolve(0),
		[isAdmin],
		0
	);

  const logoSrc = `${import.meta.env.BASE_URL}favicon.ico`;

  const adminNavigation = [
    { name: 'Home', href: HOME_ROUTE, icon: Home },
    { name: 'Questions', href: '/questions', icon: FileQuestion },
    { name: 'Modules', href: '/modules', icon: Layers },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  // Students should not see a Home button or top-level navigation;
  // they are expected to stay within the quiz experience only.
  const navigation = isAdmin ? adminNavigation : [];

  const isActive = (path: string) => location.pathname === path;

  const isModuleRunner = location.pathname.startsWith('/module/');
  const isModuleEditor = location.pathname.includes('/modules/') && (location.pathname.includes('/edit') || location.pathname.includes('/new'));
  
  return (
    <div className={cn("flex flex-col h-screen min-h-0 overflow-hidden", isModuleRunner ? "bg-white" : "bg-background")}>
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-gradient-to-r from-primary via-accent to-primary text-primary-foreground shadow-sm backdrop-blur supports-[backdrop-filter]:bg-opacity-90">
        <div className="max-w-7xl mx-auto h-16 md:h-18 px-3 md:px-4 flex items-center justify-between">
          {/* Left: logo / brand */}
          <div className="flex items-center gap-2">
            <img
              src={logoSrc}
              alt="Limit logo"
              className="h-7 w-7 md:h-8 md:w-8 rounded"
            />
            {isAdmin ? (
              <Link to={HOME_ROUTE} className="text-xl md:text-2xl font-semibold tracking-tight">
                Limit
              </Link>
            ) : (
              <span className="text-xl md:text-2xl font-semibold tracking-tight">
                Limit
              </span>
            )}
          </div>

          {/* Right: primary navigation and user info */}
          <div className="flex items-center gap-2">
            {navigation.length > 0 && (
              <nav className="flex items-center gap-1 rounded-full bg-black/10 px-1 md:px-2 py-1">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const showErrorBadge = item.name === 'Settings' && (newErrorReportCount ?? 0) > 0;
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
                                : 'text-white/85 hover:bg-white/10 hover:text-white'
                            )}
                          >
                            <span className="relative inline-flex">
                              <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                              {showErrorBadge && (
                                <span
                                  className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-4 text-center"
                                >
                                  {Math.min(99, newErrorReportCount ?? 0)}
                                </span>
                              )}
                            </span>
                            <span className="hidden sm:inline">{item.name}</span>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>{item.name}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </nav>
            )}
            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-white/20">
                <span className="text-xs text-white/80 hidden md:inline">
                  {user.username}
                </span>
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
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className={cn("flex-1 min-h-0 overflow-y-auto overscroll-contain show-scrollbar", isModuleRunner && "bg-white")}> 
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
