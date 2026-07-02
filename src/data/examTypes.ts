export type ExamChoice = {
  id: "A" | "B" | "C" | "D";
  text: string;
  explanation: string;
  isCorrect: boolean;
};

export type ExamQuestion = {
  id: string;
  sourceOrder: number;
  domainId: string;
  scenarioId: string;
  scenarioLabel?: string;
  taskStatementIds: string[];
  skills: string[];
  knowledge: string[];
  guideReferences: string[];
  guideSummary: string;
  type: "single_choice";
  prompt: string;
  choices: ExamChoice[];
};

export type ExamDomain = {
  id: string;
  number: number;
  label: string;
  description: string;
  weightPercent: number;
  targetQuestionCount: number;
  taskStatementIds: string[];
};

export type ExamBank = {
  schemaVersion: 1;
  bankId: string;
  title: string;
  description: string;
  source: {
    path: string;
    kind: string;
    notes: string;
  };
  settings: {
    totalQuestions: number;
    durationMinutes: number;
    scoreScale: number;
    passingScore: number;
  };
  domains: ExamDomain[];
  questions: ExamQuestion[];
};

export type AnswerMap = Record<string, ExamChoice["id"] | undefined>;
export type FlagMap = Record<string, boolean | undefined>;
export type SkipMap = Record<string, boolean | undefined>;
