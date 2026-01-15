import { create } from 'zustand';
import { Question, Module, Attempt, Tag, AppSettings } from './db';

interface AppStore {
  // Current state
  currentAttempt: Attempt | null;
  isExamMode: boolean;
  timerState: {
    startUtc: number;
    expectedDurationMs: number;
    remainingMs: number;
    localMonotonicOffset: number;
    isPaused: boolean;
  } | null;
  
  // UI state
  sidebarOpen: boolean;
  selectedTags: string[];
  searchQuery: string;
  
  // Actions
  setCurrentAttempt: (attempt: Attempt | null) => void;
  setExamMode: (isExam: boolean) => void;
  setTimerState: (state: AppStore['timerState']) => void;
  setSidebarOpen: (open: boolean) => void;
  setSelectedTags: (tags: string[]) => void;
  setSearchQuery: (query: string) => void;
  
  // Timer actions
  startTimer: (durationMs: number) => void;
  updateTimer: (remainingMs: number) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // Initial state
  currentAttempt: null,
  isExamMode: false,
  timerState: null,
  sidebarOpen: true,
  selectedTags: [],
  searchQuery: '',
  
  // Actions
  setCurrentAttempt: (attempt) => set({ currentAttempt: attempt }),
  setExamMode: (isExam) => set({ isExamMode: isExam }),
  setTimerState: (state) => set({ timerState: state }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSelectedTags: (tags) => set({ selectedTags: tags }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  // Timer actions
  startTimer: (durationMs) => {
    const now = Date.now();
    set({
      timerState: {
        startUtc: now,
        expectedDurationMs: durationMs,
        remainingMs: durationMs,
        localMonotonicOffset: now - performance.now(),
        isPaused: false,
      },
    });
  },
  
  updateTimer: (remainingMs) =>
    set((state) => ({
      timerState: state.timerState
        ? { ...state.timerState, remainingMs }
        : null,
    })),
  
  pauseTimer: () =>
    set((state) => ({
      timerState: state.timerState
        ? { ...state.timerState, isPaused: true }
        : null,
    })),
  
  resumeTimer: () =>
    set((state) => ({
      timerState: state.timerState
        ? { ...state.timerState, isPaused: false }
        : null,
    })),
  
  stopTimer: () => set({ timerState: null }),
}));
