import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useModules } from "@/hooks/useModules";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { checkDailyLimit } from "@/lib/dailyLimit";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { areAllQuestionsCompleted } from "@/lib/completedQuestions";
import { useLiveQuery } from "dexie-react-hooks";
import { isInReviewPhase, isReviewExpired, getReviewTimeRemaining } from "@/lib/reviewHelpers";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function ModuleCard({ m, now, navigate, userId, isCompleted }: { m: any; now: number; navigate: any; userId?: string; isCompleted?: boolean }) {
  const examTimeRemaining = (() => {
    if (!m.scheduledStartUtc || !m.scheduledEndUtc) return null;
    if (now < m.scheduledStartUtc) return null;
    const remaining = Math.max(0, m.scheduledEndUtc - now);
    return remaining > 0 ? remaining : null;
  })();

  // Check if exam is in review phase
  const inReviewPhase = m.type === "exam" && isInReviewPhase(m, now);
  const reviewExpired = m.type === "exam" && isReviewExpired(m, now);
  const reviewTimeRemaining = inReviewPhase ? getReviewTimeRemaining(m, now) : 0;
  
  // Check if review module should be shown (2 minutes grace period after review ends)
  const reviewEndTime = m.type === "exam" && m.scheduledEndUtc && m.settings?.reviewDurationSeconds
    ? m.scheduledEndUtc + (m.settings.reviewDurationSeconds * 1000)
    : 0;
  const twoMinutesAfterReviewEnd = reviewEndTime + (2 * 60 * 1000);
  const showReviewModule = m.type === "exam" && m.settings?.allowReview && m.settings?.reviewDurationSeconds && 
    now >= m.scheduledEndUtc && now < twoMinutesAfterReviewEnd;

  const examEndTime = m.scheduledEndUtc ?? 0;
  const finalEndTime = examEndTime;
  const isAfterWindow = now >= finalEndTime && !showReviewModule;
  
  // Disable if: after exam window (and not in review) OR before exam start OR all questions completed (for practice)
  let isDisabled =
    m.type === "exam" && m.scheduledStartUtc && m.scheduledEndUtc
      ? now < m.scheduledStartUtc || (now >= m.scheduledEndUtc && !showReviewModule)
      : false;

  // For practice modules, disable if all questions are completed
  if (m.type === "practice" && isCompleted) {
    isDisabled = true;
  }
  
  // For review modules, disable Review button if review expired
  if (showReviewModule && reviewExpired) {
    isDisabled = true;
  }

  // Apply optional recurring availability window (practice modules only).
  if (m.type === "practice" && m.settings && !isCompleted) {
    const day = new Date(now).getDay(); // 0 (Sun) - 6 (Sat), local time
    const minutesSinceMidnight = (() => {
      const d = new Date(now);
      return d.getHours() * 60 + d.getMinutes();
    })();

    const allowedDays: number[] | undefined = m.settings.allowedDaysOfWeek;
    const window = m.settings.allowedTimeWindow;

    if (Array.isArray(allowedDays) && allowedDays.length > 0 && !allowedDays.includes(day)) {
      isDisabled = true;
    }

    if (
      window &&
      typeof window.startMinutes === "number" &&
      typeof window.endMinutes === "number" &&
      window.endMinutes > window.startMinutes
    ) {
      if (minutesSinceMidnight < window.startMinutes || minutesSinceMidnight >= window.endMinutes) {
        isDisabled = true;
      }
    }
  }

  return (
    <Card
      key={m.id}
      className="w-full flex items-center justify-between px-8 py-6 bg-green-50 border-green-100 shadow-md rounded-lg transition-all duration-300 ease-out hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.01] hover:bg-green-100"
    >
      <div className="space-y-1">
        <h3 className="text-5xl font-semibold">
          {showReviewModule ? `${m.title} (R)` : m.title}
        </h3>
        {m.type === "exam" && m.scheduledStartUtc && m.scheduledEndUtc && !showReviewModule && (
          <div className="text-sm text-muted-foreground">
            <p>Start: {new Date(m.scheduledStartUtc).toLocaleString()}</p>
            <p>End: {new Date(m.scheduledEndUtc).toLocaleString()}</p>
          </div>
        )}
        {showReviewModule && (
          <div className="text-sm text-muted-foreground">
            <p>Exam ended: {new Date(m.scheduledEndUtc).toLocaleString()}</p>
            {inReviewPhase && (
              <p className="text-green-700 font-semibold">
                Review time remaining: {formatTime(reviewTimeRemaining)}
              </p>
            )}
            {reviewExpired && (
              <p className="text-gray-500">Review period has ended</p>
            )}
          </div>
        )}
        <div className="flex gap-4 text-sm text-muted-foreground">
          {examTimeRemaining !== null && !showReviewModule && (
            <span>Exam Time Remaining: <span className="font-semibold text-foreground">{formatTime(examTimeRemaining)}</span></span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button 
              className="bg-green-700 hover:bg-green-800 text-white px-6 w-full"
              disabled={isDisabled}
            >
              INSTRUCTIONS
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[92vw] max-w-sm sm:max-w-md p-4">
            <DialogHeader>
              <DialogTitle className="text-base">{m.title}</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                {m.description && m.description.trim().length > 0
                  ? m.description
                  : "No instructions provided."}
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  className="bg-green-700 hover:bg-green-800 text-white px-6 w-full disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed"
                  disabled={isDisabled}
                  onClick={async () => {
                    // Don't navigate if disabled
                    if (isDisabled) {
                      return;
                    }

                    const nowLocal = Date.now();

                    // If review module, navigate to review
                    if (showReviewModule && inReviewPhase) {
                      navigate(`/module/${m.id}`);
                      return;
                    }

                    // Exam schedule gating
                    const beforeExamStart =
                      m.type === "exam" &&
                      m.scheduledStartUtc &&
                      m.scheduledEndUtc &&
                      nowLocal < m.scheduledStartUtc;

                    const afterExamEnd =
                      m.type === "exam" &&
                      m.scheduledStartUtc &&
                      m.scheduledEndUtc &&
                      nowLocal >= m.scheduledEndUtc &&
                      !showReviewModule;

                    // Recurring availability gating (practice modules only)
                    let outsideAvailability = false;
                    if (m.type === "practice" && m.settings) {
                      const d = new Date(nowLocal);
                      const day = d.getDay();
                      const minutes = d.getHours() * 60 + d.getMinutes();
                      const allowedDays: number[] | undefined = m.settings.allowedDaysOfWeek;
                      const window = m.settings.allowedTimeWindow;

                      if (Array.isArray(allowedDays) && allowedDays.length > 0 && !allowedDays.includes(day)) {
                        outsideAvailability = true;
                      }

                      if (
                        window &&
                        typeof window.startMinutes === "number" &&
                        typeof window.endMinutes === "number" &&
                        window.endMinutes > window.startMinutes
                      ) {
                        if (minutes < window.startMinutes || minutes >= window.endMinutes) {
                          outsideAvailability = true;
                        }
                      }
                    }

                    if (beforeExamStart) {
                      toast({
                        title: "Module has not started yet",
                        description: "This module will become available at its scheduled start time.",
                        variant: "destructive",
                      });
                      return;
                    }

                    if (afterExamEnd || outsideAvailability) {
                      toast({
                        title: "Module is not available right now",
                        description: "Please come back later when this module is within its active time window.",
                        variant: "destructive",
                      });
                      return;
                    }

                    // Check daily limit for practice modules (per student when userId is present)
                    if (m.type === "practice") {
                      const limitCheck = await checkDailyLimit(m.id, userId);
                      if (limitCheck.reached) {
                        navigate(`/daily-limit/${m.id}`);
                        return;
                      }
                    }

                    navigate(`/module/${m.id}`);
                  }}
                >
                  {(() => {
                    // Show Review button for review modules
                    if (showReviewModule) {
                      if (reviewExpired) {
                        return "REVIEW";
                      }
                      return "REVIEW";
                    }
                    
                    if (m.type === "exam" && m.scheduledStartUtc && m.scheduledEndUtc) {
                      if (now < m.scheduledStartUtc) {
                        const remainingSec = Math.max(
                          0,
                          Math.floor((m.scheduledStartUtc - now) / 1000)
                        );
                        const countdownLabel = new Date(
                          remainingSec * 1000
                        )
                          .toISOString()
                          .substring(11, 19); // HH:MM:SS
                        return `Starts in ${countdownLabel}`;
                      }
                      if (isAfterWindow) {
                        return "Window ended";
                      }
                    }
                    // Show "COMPLETED" for practice modules when all questions are done
                    if (m.type === "practice" && isCompleted) {
                      return "COMPLETED";
                    }
                    return "START";
                  })()}
                </Button>
              </span>
            </TooltipTrigger>
            {reviewExpired && (
              <TooltipContent>
                <p>Review period has ended</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </Card>
  );
}

const Home = () => {
  const modules = useModules();
  const navigate = useNavigate();
  const location = useLocation();
  const [now, setNow] = useState(() => Date.now());
  const { user, isAdmin } = useAuth();
  const [completionStatus, setCompletionStatus] = useState<Record<string, boolean>>({});

  // Watch attempts to automatically refresh completion status when they change
  // Count completed practice attempts for this user - when this changes, we know to re-check completion
  const practiceAttemptsCount = useLiveQuery(async () => {
    if (!user?.id || !modules) return 0;
    const practiceModuleIds = modules.filter(m => m.type === "practice").map(m => m.id);
    if (practiceModuleIds.length === 0) return 0;
    const count = await db.attempts
      .where('moduleId')
      .anyOf(practiceModuleIds)
      .filter(a => a.userId === user.id && a.completed === true)
      .count();
    return count;
  }, [user?.id, modules]) || 0;

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Check completion status for practice modules
  // This runs when modules change, user changes, attempts change, or when navigating back to home
  useEffect(() => {
    const checkCompletions = async () => {
      if (!modules || !user?.id) {
        setCompletionStatus({});
        return;
      }
      
      const status: Record<string, boolean> = {};
      for (const module of modules) {
        if (module.type === "practice") {
          try {
            const completed = await areAllQuestionsCompleted(module.id, user.id);
            status[module.id] = completed;
            console.log(`[Home] Module "${module.title}" (${module.id}): completed=${completed}`);
          } catch (error) {
            console.error(`Error checking completion for module ${module.id}:`, error);
            status[module.id] = false;
          }
        }
      }
      console.log(`[Home] Completion status:`, status);
      setCompletionStatus(status);
    };

    checkCompletions();
  }, [modules, user?.id, location.pathname, practiceAttemptsCount]); // Added practiceAttemptsCount to refresh when attempts change

  const list = (modules ?? []).filter((m) => {
    // Students only see modules explicitly assigned to them.
    if (!isAdmin) {
      const userId = user?.id;
      const assigned: string[] = Array.isArray(m.assignedUserIds) ? m.assignedUserIds : [];
      if (!userId || !assigned.includes(userId)) {
        return false;
      }
    }

    // For exam modules, check if review module should be shown
    if (m.type === "exam" && m.settings?.allowReview && m.settings?.reviewDurationSeconds && m.scheduledEndUtc) {
      const reviewEndTime = m.scheduledEndUtc + (m.settings.reviewDurationSeconds * 1000);
      const twoMinutesAfterReviewEnd = reviewEndTime + (2 * 60 * 1000);
      
      // Show review module if we're past exam end but within 2 minutes of review end
      const showReviewModule = now >= m.scheduledEndUtc && now < twoMinutesAfterReviewEnd;
      
      // If exam hasn't started yet, show normal exam module
      if (m.scheduledStartUtc && now < m.scheduledStartUtc) {
        return true;
      }
      
      // If we're in exam period, show normal exam module (not review)
      if (m.scheduledEndUtc && now < m.scheduledEndUtc) {
        return true;
      }
      
      // If we're past exam end, only show review module (not the original exam)
      if (now >= m.scheduledEndUtc) {
        return showReviewModule;
      }
    }

    if (m.type !== "exam") return true;

    // If no schedule metadata, keep legacy behavior (respect locked flag and 2-minute grace period)
    if (!m.scheduledStartUtc || !m.scheduledEndUtc) {
      if (!m.locked) return true;
      const updatedAt = m.updatedAt ?? 0;
      const twoMinutesMs = 2 * 60 * 1000;
      return now - updatedAt <= twoMinutesMs;
    }

    const appearFrom = m.scheduledStartUtc - 5 * 60 * 1000; // 5 minutes before start
    const examEndTime = m.scheduledEndUtc;
    const reviewDurationSeconds = m.settings.reviewDurationSeconds ?? 0;
    const reviewEndTime = examEndTime + (reviewDurationSeconds * 1000);
    
    // For modules with review: show until review time is over + 2 minutes
    // For modules without review: show until exam end + 2 minutes
    const finalEndTime = m.settings.allowReview && reviewDurationSeconds > 0 
      ? reviewEndTime 
      : examEndTime;
    const twoMinutesAfterEnd = finalEndTime + (2 * 60 * 1000);
    
    if (now < appearFrom) return false; // too early to show
    if (now >= twoMinutesAfterEnd) return false; // hide after 2 minutes past end (exam or review)
    
    // If exam/review window has ended but within 2-minute grace period, show but disable
    const afterWindow = now >= finalEndTime;
    if (afterWindow) {
      // Still show for 2 minutes after end, but will be disabled
      return now < twoMinutesAfterEnd;
    }

    // Within visible window, still respect locked + 2-minute grace rule
    if (!m.locked) return true;
    const updatedAt = m.updatedAt ?? 0;
    const twoMinutesMs = 2 * 60 * 1000;
    return now - updatedAt <= twoMinutesMs;
  });

  if (list.length === 0) {
    return (
      <div className="w-full py-10">
        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            onClick={() => navigate('/songs')}
            className="border-green-300 text-green-800 hover:bg-green-50"
          >
            Songs
          </Button>
        </div>
        <div className="text-center text-muted-foreground">No modules to show</div>
      </div>
    );
  }

  return (
    <div className="w-full py-10 space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => navigate('/songs')}
          className="border-green-300 text-green-800 hover:bg-green-50"
        >
          Songs
        </Button>
      </div>
      {list.map((m) => (
        <ModuleCard 
          key={m.id} 
          m={m} 
          now={now} 
          navigate={navigate} 
          userId={user?.id} 
          isCompleted={m.type === "practice" ? (completionStatus[m.id] === true) : false}
        />
      ))}
    </div>
  );
};

export default Home;
