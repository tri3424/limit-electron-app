export interface DailyStats {
  id: string;
  date: string; // YYYY-MM-DD
  moduleId: string;
  moduleType: 'exam' | 'practice';
  questionsDone: number;
  totalCorrect: number;
  totalTimeMs: number;
  attemptsCompleted: number;
  questionIds: string[]; // IDs of questions attempted on this day
  createdAt: number;
}

export interface DailyStatsSummary {
  date: string;
  totalQuestionsDone: number;
  totalCorrect: number;
  accuracy: number;
  averageTimePerQuestionMs: number;
  attemptsCompleted: number;
  examModulesCount: number;
  practiceModulesCount: number;
  moduleBreakdown: {
    moduleId: string;
    moduleTitle: string;
    moduleType: 'exam' | 'practice';
    questionsDone: number;
    totalCorrect: number;
    totalTimeMs: number;
    attemptsCompleted: number;
  }[];
}
