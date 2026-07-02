import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Flag,
  Layers,
  ListChecks,
  Lock,
  LogOut,
  Play,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Target,
  Timer,
  Unlock,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  AnswerMap,
  ExamBank,
  ExamChoice,
  ExamDomain,
  ExamQuestion,
  FlagMap,
  SkipMap,
} from "../data/examTypes";
import {
  studyGuideScenariosById,
  studyGuideTasksById,
} from "../data/studyGuide";
import {
  formatDuration,
  getCorrectChoice,
  getDomainBreakdown,
  getQuestionResult,
  scoreExam,
} from "../lib/examEngine";

type ExamMode = "timed" | "practice" | "targeted";
type Screen = "start" | "running" | "result" | "review" | "flashcard";
type FinishReason = "submitted" | "timeout" | "quit";
type ReviewFilter = "all" | "missed" | "flagged" | "skipped";

type StoredExamSession = {
  version: 2;
  bankId: string;
  screen: Exclude<Screen, "start" | "flashcard">;
  mode: Exclude<ExamMode, "targeted">;
  sessionQuestionIds: string[];
  currentIndex: number;
  answers: AnswerMap;
  flags: FlagMap;
  skips: SkipMap;
  remainingSeconds: number;
  elapsedSeconds: number;
  reviewFilter: ReviewFilter;
  sessionId: string;
  finishReason: FinishReason | null;
  focusLossCount: number;
  updatedAt: number;
};

type RestoredExamSession = {
  bank: ExamBank;
  payload: StoredExamSession;
};

type DomainStat = { correct: number; seen: number };
type DomainHistory = Record<string, DomainStat>;
type FlashCard = { step: number; due: number };
type FlashState = Record<string, FlashCard>;
type SaveProfile = { nickname: string; email: string; pin: string };

type PracticeExamProps = {
  banks: ExamBank[];
  initialBankId?: string;
};

const examSessionStorageKey = "sample-claude-exams.active-exam-session.v2";
const historyStorageKey = "sample-claude-exams.domain-history.v1";
const flashcardStorageKey = "sample-claude-exams.flashcards.v1";
const profileStorageKey = "sample-claude-exams.profile.v1";
const guidePrefKey = "sample-claude-exams.show-guide.v1";

const FLASH_STEPS = [1, 2, 4, 9, 20];
const DAY_MS = 86_400_000;

function createSessionId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const section = (length: number) =>
    Array.from({ length }, () => {
      return alphabet[Math.floor(Math.random() * alphabet.length)];
    }).join("");

  return `SCE-${section(5)}-${section(4)}`;
}

function getBrowserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  const storage = getBrowserStorage();
  if (!storage) {
    return fallback;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed: unknown = JSON.parse(raw);
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable or full; in-memory state still works.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStoredMode(value: unknown): value is StoredExamSession["mode"] {
  return value === "timed" || value === "practice";
}

function isStoredScreen(value: unknown): value is StoredExamSession["screen"] {
  return value === "running" || value === "result" || value === "review";
}

function isFinishReason(value: unknown): value is FinishReason {
  return value === "submitted" || value === "timeout" || value === "quit";
}

function isReviewFilter(value: unknown): value is ReviewFilter {
  return (
    value === "all" ||
    value === "missed" ||
    value === "flagged" ||
    value === "skipped"
  );
}

function readInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(value)));
}

function sanitizeAnswers(
  questions: ExamQuestion[],
  value: unknown
): AnswerMap {
  if (!isRecord(value)) {
    return {};
  }

  return questions.reduce<AnswerMap>((result, question) => {
    const answer = value[question.id];
    if (question.choices.some((choice) => choice.id === answer)) {
      result[question.id] = answer as ExamChoice["id"];
    }

    return result;
  }, {});
}

function sanitizeBooleanQuestionMap(
  questions: ExamQuestion[],
  value: unknown,
  answers: AnswerMap = {}
) {
  if (!isRecord(value)) {
    return {};
  }

  return questions.reduce<Record<string, boolean | undefined>>(
    (result, question) => {
      if (!answers[question.id] && value[question.id] === true) {
        result[question.id] = true;
      }

      return result;
    },
    {}
  );
}

function buildSessionBank(bank: ExamBank, ids: string[]): ExamBank {
  if (!ids.length) {
    return bank;
  }

  const byId = new Map(bank.questions.map((question) => [question.id, question]));
  const questions = ids
    .map((id) => byId.get(id))
    .filter((question): question is ExamQuestion => Boolean(question));

  if (!questions.length) {
    return bank;
  }

  return {
    ...bank,
    settings: { ...bank.settings, totalQuestions: questions.length },
    questions,
  };
}

function readStoredExamSession(banks: ExamBank[]): RestoredExamSession | null {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }

  try {
    const stored = storage.getItem(examSessionStorageKey);
    if (!stored) {
      return null;
    }

    const raw: unknown = JSON.parse(stored);
    if (!isRecord(raw) || raw.version !== 2 || typeof raw.bankId !== "string") {
      storage.removeItem(examSessionStorageKey);
      return null;
    }

    const bank = banks.find((candidate) => candidate.bankId === raw.bankId);
    if (!bank || !isStoredScreen(raw.screen) || !isStoredMode(raw.mode)) {
      storage.removeItem(examSessionStorageKey);
      return null;
    }

    const sessionQuestionIds = Array.isArray(raw.sessionQuestionIds)
      ? (raw.sessionQuestionIds.filter(
          (id) => typeof id === "string"
        ) as string[]).filter((id) =>
          bank.questions.some((question) => question.id === id)
        )
      : [];
    const sessionBank = buildSessionBank(bank, sessionQuestionIds);
    const questions = sessionBank.questions;

    const mode = raw.mode;
    const answers = sanitizeAnswers(questions, raw.answers);
    const flags = sanitizeBooleanQuestionMap(questions, raw.flags);
    const skips = sanitizeBooleanQuestionMap(questions, raw.skips, answers);
    const maxSeconds = bank.settings.durationMinutes * 60;
    const savedAt = readInteger(raw.updatedAt, Date.now(), 0, Date.now());
    const secondsAway = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
    let remainingSeconds = readInteger(
      raw.remainingSeconds,
      maxSeconds,
      0,
      maxSeconds
    );
    let elapsedSeconds = readInteger(
      raw.elapsedSeconds,
      0,
      0,
      Number.MAX_SAFE_INTEGER
    );
    let screen: StoredExamSession["screen"] = raw.screen;
    let finishReason =
      raw.finishReason === null || raw.finishReason === undefined
        ? null
        : isFinishReason(raw.finishReason)
          ? raw.finishReason
          : null;

    if (screen === "running" && mode === "timed") {
      remainingSeconds = Math.max(0, remainingSeconds - secondsAway);
      elapsedSeconds += secondsAway;

      if (remainingSeconds === 0) {
        screen = "result";
        finishReason = "timeout";
      }
    }

    const restoredScore = scoreExam(sessionBank, answers, skips);
    if (screen === "review" && finishReason !== "submitted") {
      screen = "result";
    }

    if (screen === "review" && !restoredScore.complete) {
      screen = "result";
    }

    return {
      bank,
      payload: {
        version: 2,
        bankId: bank.bankId,
        screen,
        mode,
        sessionQuestionIds,
        currentIndex: readInteger(
          raw.currentIndex,
          0,
          0,
          Math.max(0, questions.length - 1)
        ),
        answers,
        flags,
        skips,
        remainingSeconds,
        elapsedSeconds,
        reviewFilter: isReviewFilter(raw.reviewFilter)
          ? raw.reviewFilter
          : "all",
        sessionId:
          typeof raw.sessionId === "string" && raw.sessionId.trim()
            ? raw.sessionId
            : createSessionId(),
        finishReason,
        focusLossCount: readInteger(
          raw.focusLossCount,
          0,
          0,
          Number.MAX_SAFE_INTEGER
        ),
        updatedAt: Date.now(),
      },
    };
  } catch {
    storage.removeItem(examSessionStorageKey);
    return null;
  }
}

function shortDomainLabel(label: string) {
  const head = label.split("&")[0].trim();
  return head.length > 15 ? `${head.slice(0, 14)}…` : head;
}

function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
        }

        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}

function getChoiceClass(
  choice: ExamChoice,
  question: ExamQuestion,
  answers: AnswerMap,
  skips: SkipMap,
  review = false
) {
  const result = getQuestionResult(question, answers, skips);
  const selected = result.selected === choice.id;

  if (!review) {
    return selected ? "answer-choice is-selected" : "answer-choice";
  }

  if (choice.isCorrect) {
    return selected
      ? "answer-choice is-correct is-selected"
      : "answer-choice is-correct";
  }

  if (selected) {
    return "answer-choice is-wrong is-selected";
  }

  return "answer-choice is-muted";
}

function getQuestionDomain(bank: ExamBank, question: ExamQuestion) {
  return bank.domains.find((domain) => domain.id === question.domainId);
}

function ExamPageHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="exam-page-head">
      <span className="exam-page-eyebrow">{eyebrow}</span>
      <h1 className="exam-page-title">{title}</h1>
    </div>
  );
}

function PerformanceRadar({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const size = 300;
  const center = size / 2;
  const radius = 104;
  const levels = 4;
  const count = data.length;
  const angleFor = (index: number) =>
    -Math.PI / 2 + (index / count) * Math.PI * 2;

  const pointFor = (index: number, ratio: number) => {
    const angle = angleFor(index);
    return {
      x: center + radius * ratio * Math.cos(angle),
      y: center + radius * ratio * Math.sin(angle),
    };
  };

  const gridPolys = Array.from({ length: levels }, (_, level) => {
    const ratio = (level + 1) / levels;
    return data
      .map((_, index) => {
        const point = pointFor(index, ratio);
        return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      })
      .join(" ");
  });

  const dataPoly = data
    .map((entry, index) => {
      const point = pointFor(index, Math.max(0, Math.min(100, entry.value)) / 100);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox="-78 -22 456 344" role="img" aria-label="Per-domain accuracy radar">
      {gridPolys.map((poly, index) => (
        <polygon
          key={`grid-${index}`}
          points={poly}
          fill="none"
          stroke="var(--exam-line-strong)"
          strokeWidth={1}
          opacity={0.55}
        />
      ))}
      {data.map((entry, index) => {
        const outer = pointFor(index, 1);
        return (
          <line
            key={`axis-${entry.label}`}
            x1={center}
            y1={center}
            x2={outer.x}
            y2={outer.y}
            stroke="var(--exam-line-strong)"
            strokeWidth={1}
            opacity={0.55}
          />
        );
      })}
      <polygon
        points={dataPoly}
        fill="rgba(245, 181, 29, 0.32)"
        stroke="var(--exam-accent-strong)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {data.map((entry, index) => {
        const point = pointFor(index, Math.max(0, Math.min(100, entry.value)) / 100);
        return (
          <circle
            key={`dot-${entry.label}`}
            cx={point.x}
            cy={point.y}
            r={3.2}
            fill="var(--exam-accent-strong)"
          />
        );
      })}
      {data.map((entry, index) => {
        const label = pointFor(index, 1.16);
        const anchor =
          Math.abs(label.x - center) < 14
            ? "middle"
            : label.x > center
              ? "start"
              : "end";
        return (
          <text
            key={`label-${entry.label}`}
            x={label.x}
            y={label.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontFamily="var(--font-mono)"
            fontSize={10.5}
            fontWeight={700}
            fill="var(--exam-muted)"
          >
            {entry.label}
          </text>
        );
      })}
    </svg>
  );
}

function GuideReferencePanel({
  question,
  domain,
  tone = "default",
}: {
  question: ExamQuestion;
  domain?: ExamDomain;
  tone?: "default" | "compact";
}) {
  const scenario = studyGuideScenariosById.get(question.scenarioId);
  const scenarioLabel =
    scenario?.label ??
    question.scenarioLabel ??
    question.scenarioId
      .split("-")
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" ");
  const taskLabels = question.taskStatementIds.map((taskId) => {
    const task = studyGuideTasksById.get(taskId);
    return task ? `${task.id} ${task.title}` : taskId;
  });

  return (
    <aside
      className={
        tone === "compact"
          ? "guide-reference-panel is-compact"
          : "guide-reference-panel"
      }
      aria-label="Study guide mapping"
    >
      <div className="guide-reference-header">
        <span>Study guide focus</span>
        {domain && (
          <strong>
            Domain {domain.number} - {domain.weightPercent}%
          </strong>
        )}
      </div>
      <p>{question.guideSummary}</p>
      <dl>
        <div>
          <dt>Scenario</dt>
          <dd>{scenarioLabel}</dd>
        </div>
        <div>
          <dt>Tasks</dt>
          <dd>{taskLabels.join("; ")}</dd>
        </div>
      </dl>
      <div className="guide-chip-list" aria-label="Covered skills">
        {question.skills.slice(0, tone === "compact" ? 3 : 5).map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
    </aside>
  );
}

export default function PracticeExam({
  banks,
  initialBankId,
}: PracticeExamProps) {
  const defaultBank = banks[0];
  const [selectedBankId, setSelectedBankId] = useState(
    initialBankId ?? defaultBank?.bankId ?? ""
  );
  const [screen, setScreen] = useState<Screen>("start");
  const [mode, setMode] = useState<ExamMode>("timed");
  const [sessionQuestionIds, setSessionQuestionIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [flags, setFlags] = useState<FlagMap>({});
  const [skips, setSkips] = useState<SkipMap>({});
  const [remainingSeconds, setRemainingSeconds] = useState(
    (defaultBank?.settings.durationMinutes ?? 120) * 60
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [shareCopied, setShareCopied] = useState(false);
  const [sessionId, setSessionId] = useState(createSessionId);
  const [finishReason, setFinishReason] = useState<FinishReason | null>(null);
  const [focusLossCount, setFocusLossCount] = useState(0);
  const [isFocusBlurred, setIsFocusBlurred] = useState(false);

  const [history, setHistory] = useState<DomainHistory>({});
  const [flashSrs, setFlashSrs] = useState<FlashState>({});
  const [flashQueue, setFlashQueue] = useState<string[]>([]);
  const [flashPos, setFlashPos] = useState(0);
  const [flashRevealed, setFlashRevealed] = useState(false);
  const [profile, setProfile] = useState<SaveProfile>({
    nickname: "",
    email: "",
    pin: "",
  });
  const [showGuide, setShowGuide] = useState(true);

  const focusLostRef = useRef(false);
  const hasLoadedStoredSessionRef = useRef(false);
  const isRestoringStoredSessionRef = useRef(false);

  const bank = useMemo(() => {
    return (
      banks.find((candidate) => candidate.bankId === selectedBankId) ?? banks[0]
    );
  }, [banks, selectedBankId]);

  const sessionBank = useMemo(
    () => buildSessionBank(bank, sessionQuestionIds),
    [bank, sessionQuestionIds]
  );

  const currentQuestion =
    sessionBank.questions[currentIndex] ?? sessionBank.questions[0];
  const scoring = useMemo(
    () => scoreExam(sessionBank, answers, skips),
    [answers, sessionBank, skips]
  );
  const domainBreakdown = useMemo(
    () => getDomainBreakdown(sessionBank, answers, skips),
    [answers, sessionBank, skips]
  );
  const answeredCount = scoring.answered;
  const flaggedCount = Object.values(flags).filter(Boolean).length;
  const skippedCount = scoring.skipped;
  const openCount = scoring.open;
  const unansweredCount = scoring.total - scoring.answered;
  const canSubmit = scoring.complete;
  const reviewUnlocked = canSubmit && finishReason === "submitted";
  const progressPercentage = Math.round(
    ((answeredCount + skippedCount) / Math.max(scoring.total, 1)) * 100
  );
  const currentDomain = getQuestionDomain(bank, currentQuestion);

  const weakestDomain = useMemo(() => {
    const scored = bank.domains
      .map((domain) => ({ domain, stat: history[domain.id] }))
      .filter((entry) => entry.stat && entry.stat.seen > 0)
      .sort(
        (a, b) =>
          a.stat!.correct / a.stat!.seen - b.stat!.correct / b.stat!.seen
      );

    if (scored.length) {
      return scored[0].domain;
    }

    return (
      [...bank.domains].sort(
        (a, b) => b.weightPercent - a.weightPercent
      )[0] ?? bank.domains[0]
    );
  }, [bank, history]);

  const flashDueCount = useMemo(() => {
    const now = Date.now();
    return bank.questions.filter((question) => {
      const card = flashSrs[question.id];
      return !card || card.due <= now;
    }).length;
  }, [bank, flashSrs]);

  const profileReady =
    profile.email.trim().length > 3 && /^\d{6}$/.test(profile.pin);

  // Load persisted history, flashcard SRS, profile, and any active session.
  useEffect(() => {
    setHistory(readJson<DomainHistory>(historyStorageKey, {}));
    setFlashSrs(readJson<FlashState>(flashcardStorageKey, {}));
    setProfile(
      readJson<SaveProfile>(profileStorageKey, {
        nickname: "",
        email: "",
        pin: "",
      })
    );
    setShowGuide(readJson<boolean>(guidePrefKey, true));

    const restored = readStoredExamSession(banks);
    hasLoadedStoredSessionRef.current = true;

    if (!restored) {
      return;
    }

    isRestoringStoredSessionRef.current = true;
    setSelectedBankId(restored.bank.bankId);
    setSessionQuestionIds(restored.payload.sessionQuestionIds);
    setScreen(restored.payload.screen);
    setMode(restored.payload.mode);
    setCurrentIndex(restored.payload.currentIndex);
    setAnswers(restored.payload.answers);
    setFlags(restored.payload.flags);
    setSkips(restored.payload.skips);
    setRemainingSeconds(restored.payload.remainingSeconds);
    setElapsedSeconds(restored.payload.elapsedSeconds);
    setReviewFilter(restored.payload.reviewFilter);
    setShareCopied(false);
    setSessionId(restored.payload.sessionId);
    setFinishReason(restored.payload.finishReason);
    setFocusLossCount(restored.payload.focusLossCount);
    setIsFocusBlurred(false);
    focusLostRef.current = false;
  }, [banks]);

  // Persist the active full-length exam session (timed/practice only).
  useEffect(() => {
    if (!hasLoadedStoredSessionRef.current) {
      return;
    }

    const storage = getBrowserStorage();
    if (!storage) {
      return;
    }

    if (isRestoringStoredSessionRef.current) {
      isRestoringStoredSessionRef.current = false;
      return;
    }

    const isPersistableScreen =
      screen === "running" || screen === "result" || screen === "review";

    if (!isPersistableScreen || mode === "targeted") {
      storage.removeItem(examSessionStorageKey);
      return;
    }

    const payload: StoredExamSession = {
      version: 2,
      bankId: bank.bankId,
      screen: screen as StoredExamSession["screen"],
      mode: mode as StoredExamSession["mode"],
      sessionQuestionIds,
      currentIndex,
      answers,
      flags,
      skips,
      remainingSeconds,
      elapsedSeconds,
      reviewFilter,
      sessionId,
      finishReason,
      focusLossCount,
      updatedAt: Date.now(),
    };

    try {
      storage.setItem(examSessionStorageKey, JSON.stringify(payload));
    } catch {
      // localStorage can be unavailable or full; the live session still works.
    }
  }, [
    answers,
    bank.bankId,
    currentIndex,
    elapsedSeconds,
    finishReason,
    flags,
    focusLossCount,
    mode,
    remainingSeconds,
    reviewFilter,
    screen,
    sessionId,
    sessionQuestionIds,
    skips,
  ]);

  // Persist the optional save-progress profile.
  useEffect(() => {
    if (!hasLoadedStoredSessionRef.current) {
      return;
    }
    writeJson(profileStorageKey, profile);
  }, [profile]);

  // Persist the study-guide visibility preference.
  useEffect(() => {
    if (!hasLoadedStoredSessionRef.current) {
      return;
    }
    writeJson(guidePrefKey, showGuide);
  }, [showGuide]);

  useEffect(() => {
    if (screen !== "running") {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
      if (mode === "timed") {
        setRemainingSeconds((value) => Math.max(0, value - 1));
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [mode, screen]);

  useEffect(() => {
    if (screen === "start") {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById("practice")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [screen]);

  useEffect(() => {
    if (screen !== "running") {
      focusLostRef.current = false;
      setIsFocusBlurred(false);
      return undefined;
    }

    const markFocusLost = () => {
      if (!focusLostRef.current) {
        focusLostRef.current = true;
        setFocusLossCount((value) => value + 1);
      }
      setIsFocusBlurred(true);
    };

    const clearFocusLost = () => {
      focusLostRef.current = false;
      setIsFocusBlurred(false);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        markFocusLost();
      } else {
        clearFocusLost();
      }
    };

    window.addEventListener("blur", markFocusLost);
    window.addEventListener("focus", clearFocusLost);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("blur", markFocusLost);
      window.removeEventListener("focus", clearFocusLost);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [screen]);

  useEffect(() => {
    if (screen === "running" && mode === "timed" && remainingSeconds === 0) {
      finishExam("timeout");
    }
  }, [mode, remainingSeconds, screen]);

  useEffect(() => {
    if (screen !== "running") {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (["1", "2", "3", "4"].includes(event.key)) {
        const choice = currentQuestion.choices[Number(event.key) - 1];
        if (choice) {
          event.preventDefault();
          answerQuestion(choice.id);
        }
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFlag(currentQuestion.id);
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        toggleSkip(currentQuestion.id);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToQuestion(currentIndex + 1);
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToQuestion(currentIndex - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, currentQuestion, screen, skips]);

  function startSession(nextMode: ExamMode, ids: string[]) {
    setSessionQuestionIds(ids);
    setMode(nextMode);
    setSessionId(createSessionId());
    setCurrentIndex(0);
    setAnswers({});
    setFlags({});
    setSkips({});
    setElapsedSeconds(0);
    setRemainingSeconds(bank.settings.durationMinutes * 60);
    setReviewFilter("all");
    setShareCopied(false);
    setFinishReason(null);
    setFocusLossCount(0);
    setIsFocusBlurred(false);
    focusLostRef.current = false;
    setScreen("running");
  }

  function startExam(nextMode: Exclude<ExamMode, "targeted">) {
    startSession(
      nextMode,
      bank.questions.map((question) => question.id)
    );
  }

  function startTargeted() {
    const ids = bank.questions
      .filter((question) => question.domainId === weakestDomain.id)
      .map((question) => question.id);

    if (ids.length) {
      startSession("targeted", ids);
    }
  }

  function startFlashcards() {
    const now = Date.now();
    const due = bank.questions
      .filter((question) => {
        const card = flashSrs[question.id];
        return !card || card.due <= now;
      })
      .map((question) => question.id);
    const queue = due.length
      ? due
      : bank.questions.map((question) => question.id);

    setFlashQueue(queue);
    setFlashPos(0);
    setFlashRevealed(false);
    setScreen("flashcard");
  }

  function gradeFlashcard(good: boolean) {
    const id = flashQueue[flashPos];
    if (id) {
      setFlashSrs((prev) => {
        const current = prev[id];
        const step = good
          ? Math.min((current?.step ?? -1) + 1, FLASH_STEPS.length - 1)
          : 0;
        const next: FlashState = {
          ...prev,
          [id]: { step, due: Date.now() + FLASH_STEPS[step] * DAY_MS },
        };
        writeJson(flashcardStorageKey, next);
        return next;
      });
    }

    if (flashPos + 1 < flashQueue.length) {
      setFlashPos((value) => value + 1);
      setFlashRevealed(false);
    } else {
      setScreen("start");
    }
  }

  function selectBank(bankId: string) {
    if (screen !== "start") {
      return;
    }

    setSelectedBankId(bankId);
    setSessionQuestionIds([]);
    setCurrentIndex(0);
    setAnswers({});
    setFlags({});
    setSkips({});
    setElapsedSeconds(0);
    setRemainingSeconds(
      (banks.find((candidate) => candidate.bankId === bankId) ?? bank).settings
        .durationMinutes * 60
    );
    setReviewFilter("all");
    setShareCopied(false);
    setFinishReason(null);
  }

  function answerQuestion(choiceId: ExamChoice["id"]) {
    setAnswers((value) => ({
      ...value,
      [currentQuestion.id]: choiceId,
    }));
    setSkips((value) => ({
      ...value,
      [currentQuestion.id]: false,
    }));
  }

  function toggleFlag(questionId: string) {
    setFlags((value) => ({
      ...value,
      [questionId]: !value[questionId],
    }));
  }

  function toggleSkip(questionId: string) {
    const nextSkipped = !skips[questionId];

    setSkips((value) => ({
      ...value,
      [questionId]: nextSkipped,
    }));

    if (nextSkipped) {
      setAnswers((value) => ({
        ...value,
        [questionId]: undefined,
      }));
    }
  }

  function goToQuestion(index: number) {
    setCurrentIndex(
      Math.max(0, Math.min(sessionBank.questions.length - 1, index))
    );
  }

  function recordHistory() {
    const breakdown = getDomainBreakdown(sessionBank, answers, skips);
    if (!breakdown.length) {
      return;
    }

    setHistory((prev) => {
      const next: DomainHistory = { ...prev };
      for (const domain of breakdown) {
        const current = next[domain.id] ?? { correct: 0, seen: 0 };
        next[domain.id] = {
          correct: current.correct + domain.correct,
          seen: current.seen + domain.answered + domain.skipped,
        };
      }
      writeJson(historyStorageKey, next);
      return next;
    });
  }

  function finishExam(reason: FinishReason) {
    if (reason !== "quit") {
      recordHistory();
    }
    setFinishReason(reason);
    setIsFocusBlurred(false);
    focusLostRef.current = false;
    setScreen("result");
  }

  function submitExam() {
    if (!canSubmit) {
      return;
    }

    finishExam("submitted");
  }

  function retake() {
    setScreen("start");
    setSessionQuestionIds([]);
    setCurrentIndex(0);
    setFinishReason(null);
  }

  async function copyResult() {
    const resultText = `Sample Claude Exams session ${sessionId}: ${scoring.scaledScore}/${bank.settings.scoreScale} (${scoring.correct}/${scoring.total} correct, ${scoring.incorrect} incorrect, ${unansweredCount} unanswered, ${scoring.percentage}%).`;

    try {
      await navigator.clipboard.writeText(resultText);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch {
      setShareCopied(false);
    }
  }

  const reviewQuestions = sessionBank.questions.filter((question) => {
    if (reviewFilter === "missed") {
      const result = getQuestionResult(question, answers, skips);
      return result.isAnswered && !result.isCorrect;
    }

    if (reviewFilter === "flagged") {
      return Boolean(flags[question.id]);
    }

    if (reviewFilter === "skipped") {
      return Boolean(skips[question.id] && !answers[question.id]);
    }

    return true;
  });

  const scaleLabel = bank.settings.scoreScale.toLocaleString();
  const pageHead = (() => {
    if (screen === "flashcard") {
      return {
        eyebrow: "Flashcards",
        title: "Flashcard study — spaced repetition",
      };
    }
    if (mode === "targeted") {
      return {
        eyebrow: "Targeted practice",
        title: `Weakest domain — ${weakestDomain.label}`,
      };
    }
    if (mode === "practice") {
      return {
        eyebrow: "Practice exam",
        title: `Untimed practice — ${bank.settings.totalQuestions} questions, ${scaleLabel}-point scale`,
      };
    }
    return {
      eyebrow: "Practice exam",
      title: `Timed mock — ${bank.settings.totalQuestions} questions, ${bank.settings.durationMinutes} minutes, ${scaleLabel}-point scale`,
    };
  })();

  if (screen === "start") {
    return (
      <>
        <ExamPageHead eyebrow={pageHead.eyebrow} title={pageHead.title} />
        <section className="exam-shell" aria-labelledby="exam-title">
          <div className="exam-start-grid">
            <div className="exam-intro-panel before-start">
              <h1 id="exam-title">Before you start</h1>
              <p>
                This mock mirrors the real exam exactly:{" "}
                <b>{bank.settings.totalQuestions} questions</b>, a single session
                with no breaks, question nav + flagging, and a{" "}
                <b>{bank.settings.durationMinutes}-minute timer</b>. Length and
                timing are locked to match the sample exam blueprint — pick{" "}
                <b>Untimed practice mode</b> below if you just want to study
                without the clock. Practice modes and incomplete exams are{" "}
                <b>not saved</b> to your global dashboard stats.
              </p>

              {banks.length > 1 && (
                <div
                  className="exam-form-selector"
                  aria-label="Choose exam form"
                >
                  <p>Choose Exam Form</p>
                  <div>
                    {banks.map((candidate) => (
                      <button
                        type="button"
                        className={
                          candidate.bankId === bank.bankId
                            ? "is-active"
                            : undefined
                        }
                        aria-pressed={candidate.bankId === bank.bankId}
                        key={candidate.bankId}
                        onClick={() => selectBank(candidate.bankId)}
                      >
                        <strong>{candidate.title}</strong>
                        <span>{candidate.description}</span>
                        <small>
                          {candidate.settings.totalQuestions} questions / pass{" "}
                          {candidate.settings.passingScore}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="save-progress">
                <h3>Optional: Save Your Progress</h3>
                <p>
                  Provide your email and a 6-digit PIN to save your score and
                  receive future mock tests. Leave blank to take as guest.{" "}
                  <b>(Only full {bank.settings.totalQuestions}-Q timed mocks count toward global stats)</b>
                </p>
                <div className="save-progress-fields">
                  <input
                    id="practice-nickname"
                    name="nickname"
                    type="text"
                    inputMode="text"
                    autoComplete="name"
                    placeholder="Nickname (for leaderboard)"
                    aria-label="Nickname"
                    value={profile.nickname}
                    onChange={(event) =>
                      setProfile((prev) => ({
                        ...prev,
                        nickname: event.target.value,
                      }))
                    }
                  />
                  <input
                    id="practice-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Email address"
                    aria-label="Email address"
                    value={profile.email}
                    onChange={(event) =>
                      setProfile((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                  />
                  <input
                    id="practice-pin"
                    name="pin"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="6-digit PIN"
                    aria-label="6-digit PIN"
                    value={profile.pin}
                    onChange={(event) =>
                      setProfile((prev) => ({
                        ...prev,
                        pin: event.target.value.replace(/\D/g, "").slice(0, 6),
                      }))
                    }
                  />
                </div>
                {profileReady && (
                  <p className="save-progress-note">
                    <CheckCircle2 aria-hidden="true" />
                    Results will be saved as{" "}
                    {profile.nickname.trim() || profile.email.trim()}.
                  </p>
                )}
              </div>

              <div className="mode-stack" aria-label="Exam modes">
                <div className="mode-row">
                  <button
                    type="button"
                    className="exam-button is-primary"
                    onClick={() => startExam("timed")}
                  >
                    <Play className="button-icon" aria-hidden="true" />
                    Start timed exam ({bank.settings.totalQuestions} Qs)
                  </button>
                  <button
                    type="button"
                    className="exam-button"
                    onClick={() => startExam("practice")}
                  >
                    <BookOpenCheck className="button-icon" aria-hidden="true" />
                    Untimed practice mode
                  </button>
                </div>
                <button
                  type="button"
                  className="mode-secondary"
                  onClick={startTargeted}
                >
                  <span className="mode-secondary-label">
                    <Target aria-hidden="true" />
                    Targeted Practice (Weakest Domain)
                  </span>
                  <span className="mode-due is-clear">
                    Domain {weakestDomain.number}
                  </span>
                </button>
                <button
                  type="button"
                  className="mode-secondary"
                  onClick={startFlashcards}
                >
                  <span className="mode-secondary-label">
                    <Layers aria-hidden="true" />
                    Flashcard Mode (Study Cards)
                  </span>
                  <span
                    className={
                      flashDueCount > 0 ? "mode-due" : "mode-due is-clear"
                    }
                  >
                    {flashDueCount} Due
                  </span>
                </button>
              </div>
            </div>

            <aside className="exam-rules-panel" aria-label="Exam rules">
              <h2>Rules</h2>
              <ul>
                <li>
                  Pass mark on the real exam isn't public — this mock flags{" "}
                  <b>
                    {bank.settings.passingScore} / {scaleLabel}
                  </b>{" "}
                  as a working benchmark.
                </li>
                <li>
                  Each question is weighted equally on the {scaleLabel}-point
                  scale.
                </li>
                <li>
                  You can flag and revisit questions from the palette on the
                  right.
                </li>
                <li>
                  Submitting early or running out of time both end the session.
                </li>
                <li>
                  No external tools, notes, or tabs — this is a proctor-style
                  simulation.
                </li>
                <li>
                  Switching tabs blurs the exam and records a focus-loss event.
                </li>
              </ul>
              <p className="keyboard-hint">
                Handy shortcuts during the exam: 1–4 pick A–D · S skip · F flag ·
                ←/→ navigate.
              </p>
            </aside>
          </div>
        </section>
      </>
    );
  }

  if (screen === "flashcard") {
    const cardId = flashQueue[flashPos];
    const card = bank.questions.find((question) => question.id === cardId);
    const domain = card ? getQuestionDomain(bank, card) : undefined;
    const correct = card ? getCorrectChoice(card) : undefined;

    return (
      <>
        <ExamPageHead eyebrow={pageHead.eyebrow} title={pageHead.title} />
        <section className="exam-shell" aria-label="Flashcard study">
          <header className="flashcard-toolbar">
            <h2>Flashcard study</h2>
            <div className="flashcard-toolbar-end">
              <span className="flashcard-progress">
                {flashQueue.length > 0
                  ? `Card ${flashPos + 1} of ${flashQueue.length} · ${flashDueCount} due`
                  : "No cards loaded"}
              </span>
              <button
                type="button"
                className="exam-button is-compact"
                onClick={() => setScreen("start")}
              >
                <LogOut className="button-icon" aria-hidden="true" />
                Exit
              </button>
            </div>
          </header>

          <div className="flashcard-body">
            {card ? (
              <>
                <div className="flashcard-stage">
                  <span className="flashcard-domain">
                    {domain
                      ? `Domain ${domain.number} · ${domain.label}`
                      : "Study card"}
                  </span>
                  <p className="flashcard-prompt">
                    <FormattedText text={card.prompt} />
                  </p>
                  {flashRevealed && correct && (
                    <div className="flashcard-answer">
                      <span className="flashcard-answer-label">
                        Correct answer — {correct.id}
                      </span>
                      <strong>
                        <FormattedText text={correct.text} />
                      </strong>
                      <p>
                        <FormattedText text={correct.explanation} />
                      </p>
                    </div>
                  )}
                </div>

                {flashRevealed ? (
                  <div className="flashcard-actions">
                    <button
                      type="button"
                      className="exam-button flashcard-grade-again"
                      onClick={() => gradeFlashcard(false)}
                    >
                      <RefreshCw className="button-icon" aria-hidden="true" />
                      Review again
                    </button>
                    <button
                      type="button"
                      className="exam-button flashcard-grade-good"
                      onClick={() => gradeFlashcard(true)}
                    >
                      <CheckCircle2 className="button-icon" aria-hidden="true" />
                      Got it
                    </button>
                  </div>
                ) : (
                  <div className="flashcard-actions">
                    <button
                      type="button"
                      className="exam-button is-primary"
                      onClick={() => setFlashRevealed(true)}
                    >
                      <Eye className="button-icon" aria-hidden="true" />
                      Show answer
                    </button>
                    <button
                      type="button"
                      className="exam-button"
                      onClick={() => setScreen("start")}
                    >
                      <LogOut className="button-icon" aria-hidden="true" />
                      Exit study
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flashcard-empty">
                <Layers aria-hidden="true" />
                <p>You're all caught up — no cards are due right now.</p>
                <button
                  type="button"
                  className="exam-button is-primary"
                  onClick={() => setScreen("start")}
                >
                  Back to start
                </button>
              </div>
            )}
          </div>
        </section>
      </>
    );
  }

  if (screen === "running") {
    const selectedChoice = answers[currentQuestion.id];
    const isLastQuestion = currentIndex === sessionBank.questions.length - 1;
    const isCurrentSkipped = Boolean(
      skips[currentQuestion.id] && !selectedChoice
    );
    const timerValue =
      mode === "timed"
        ? formatDuration(remainingSeconds)
        : formatDuration(elapsedSeconds);

    return (
      <>
        <ExamPageHead eyebrow={pageHead.eyebrow} title={pageHead.title} />
        <section
          className={
            isFocusBlurred
              ? "exam-shell is-session is-focus-blurred"
              : "exam-shell is-session"
          }
          aria-label="Practice exam"
        >
          <header className="session-bar">
            <div className="session-brand">
              <span className="brand-mark" aria-hidden="true">
                CA
              </span>
              <div>
                <strong>Sample Claude Exams - Session</strong>
                <code>{sessionId}</code>
              </div>
            </div>
            <time
              className={
                mode === "timed" && remainingSeconds < 600
                  ? "session-timer is-urgent"
                  : "session-timer"
              }
              dateTime={`PT${mode === "timed" ? remainingSeconds : elapsedSeconds}S`}
            >
              {mode === "timed" ? (
                <Timer aria-hidden="true" />
              ) : (
                <Clock aria-hidden="true" />
              )}
              {timerValue}
            </time>
          </header>

          <div className="exam-content" aria-hidden={isFocusBlurred || undefined}>
            <div className="exam-session-actions">
              <div className="status-strip" aria-label="Session status">
                <span>
                  <CheckCircle2 aria-hidden="true" />
                  {answeredCount}/{scoring.total} answered
                </span>
                <span>
                  <SkipForward aria-hidden="true" />
                  {skippedCount} skipped
                </span>
                <span>
                  <AlertTriangle aria-hidden="true" />
                  {openCount} open
                </span>
                <span>
                  <Flag aria-hidden="true" />
                  {flaggedCount} flagged
                </span>
                <span>
                  <EyeOff aria-hidden="true" />
                  {focusLossCount} focus losses
                </span>
              </div>
              <div className="session-buttons">
                <button
                  type="button"
                  className="exam-button is-danger is-compact"
                  onClick={() => finishExam("quit")}
                >
                  <LogOut className="button-icon" aria-hidden="true" />
                  Quit (abandon session)
                </button>
                <button
                  type="button"
                  className="exam-button is-primary is-compact"
                  disabled={!canSubmit}
                  onClick={submitExam}
                >
                  <CheckCircle2 className="button-icon" aria-hidden="true" />
                  {canSubmit
                    ? "Submit exam"
                    : `Answer all ${scoring.total} Qs to Submit`}
                </button>
              </div>
            </div>

            <div
              className="exam-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={scoring.total}
              aria-valuenow={answeredCount + skippedCount}
              aria-label="Answered or skipped question progress"
            >
              <span
                style={
                  { "--progress": `${progressPercentage}%` } as CSSProperties
                }
              />
            </div>

            <div className="exam-running-grid">
              <article className="question-panel">
                <div className="question-meta">
                  <span>
                    Question {currentIndex + 1} of {sessionBank.questions.length}
                  </span>
                  <span>
                    {currentDomain?.label} - {currentDomain?.weightPercent}%
                  </span>
                </div>
                <h3>
                  <FormattedText text={currentQuestion.prompt} />
                </h3>

                {isCurrentSkipped && (
                  <p className="question-status-note">
                    <SkipForward aria-hidden="true" />
                    This question is marked skipped. Picking an answer clears the
                    skipped state.
                  </p>
                )}

                <div
                  className="answer-list"
                  role="radiogroup"
                  aria-label={`Answers for ${currentQuestion.id}`}
                >
                  {currentQuestion.choices.map((choice) => (
                    <button
                      type="button"
                      className={getChoiceClass(
                        choice,
                        currentQuestion,
                        answers,
                        skips
                      )}
                      key={choice.id}
                      role="radio"
                      aria-checked={selectedChoice === choice.id}
                      onClick={() => answerQuestion(choice.id)}
                    >
                      <span className="choice-letter">{choice.id}</span>
                      <span className="choice-copy">
                        <FormattedText text={choice.text} />
                      </span>
                    </button>
                  ))}
                </div>

                <div className="question-actions">
                  <div className="question-state-actions">
                    <button
                      type="button"
                      className={
                        isCurrentSkipped
                          ? "skip-toggle is-active"
                          : "skip-toggle"
                      }
                      aria-pressed={isCurrentSkipped}
                      onClick={() => toggleSkip(currentQuestion.id)}
                    >
                      <SkipForward className="button-icon" aria-hidden="true" />
                      {isCurrentSkipped ? "Skipped" : "Mark skipped"}
                    </button>
                    <button
                      type="button"
                      className={
                        flags[currentQuestion.id]
                          ? "flag-toggle is-active"
                          : "flag-toggle"
                      }
                      aria-pressed={Boolean(flags[currentQuestion.id])}
                      onClick={() => toggleFlag(currentQuestion.id)}
                    >
                      <Flag className="button-icon" aria-hidden="true" />
                      {flags[currentQuestion.id] ? "Flagged" : "Flag for review"}
                    </button>
                  </div>

                  <div className="question-nav">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => goToQuestion(currentIndex - 1)}
                      disabled={currentIndex === 0}
                      aria-label="Previous question"
                    >
                      <ArrowLeft aria-hidden="true" />
                    </button>
                    {isLastQuestion ? (
                      <button
                        type="button"
                        className="exam-button is-primary is-compact"
                        disabled={!canSubmit}
                        onClick={submitExam}
                      >
                        Submit exam
                        <CheckCircle2
                          className="button-icon"
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="exam-button is-compact"
                        onClick={() => goToQuestion(currentIndex + 1)}
                      >
                        Next
                        <ArrowRight className="button-icon" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </article>

              <aside className="palette-panel" aria-label="Question palette">
                <div className="palette-header">
                  <h3>Question Palette</h3>
                  <span>
                    {answeredCount} answered / {skippedCount} skipped /{" "}
                    {openCount} open
                  </span>
                </div>
                <div className="palette-grid">
                  {sessionBank.questions.map((question, index) => {
                    const isCurrent = index === currentIndex;
                    const isAnswered = Boolean(answers[question.id]);
                    const isSkipped = Boolean(
                      !answers[question.id] && skips[question.id]
                    );
                    const isFlagged = Boolean(flags[question.id]);
                    const classes = [
                      "palette-button",
                      isCurrent ? "is-current" : "",
                      isAnswered ? "is-answered" : "",
                      isSkipped ? "is-skipped" : "",
                      isFlagged ? "is-flagged" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <button
                        type="button"
                        className={classes}
                        key={question.id}
                        onClick={() => goToQuestion(index)}
                        aria-label={`Go to question ${index + 1}${isAnswered ? ", answered" : isSkipped ? ", skipped" : ", open"}${isFlagged ? ", flagged" : ""}`}
                        aria-current={isCurrent ? "step" : undefined}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="palette-legend" aria-label="Palette legend">
                  <span>
                    <i className="legend-dot is-answered" /> Answered
                  </span>
                  <span>
                    <i className="legend-dot is-skipped" /> Skipped
                  </span>
                  <span>
                    <i className="legend-dot is-flagged" /> Flagged
                  </span>
                  <span>
                    <i className="legend-dot" /> Unanswered
                  </span>
                </div>
                <button
                  type="button"
                  className="exam-button is-primary is-full"
                  disabled={!canSubmit}
                  onClick={submitExam}
                >
                  {canSubmit
                    ? "Submit exam"
                    : `Answer all ${scoring.total} Qs to Submit`}
                  <CheckCircle2 className="button-icon" aria-hidden="true" />
                </button>
                <div className="guide-toggle-wrap">
                  <button
                    type="button"
                    className="guide-toggle"
                    aria-expanded={showGuide}
                    onClick={() => setShowGuide((value) => !value)}
                  >
                    {showGuide ? (
                      <EyeOff aria-hidden="true" />
                    ) : (
                      <Eye aria-hidden="true" />
                    )}
                    {showGuide
                      ? "Hide study guide focus"
                      : "Show study guide focus"}
                  </button>
                  {showGuide && (
                    <GuideReferencePanel
                      question={currentQuestion}
                      domain={currentDomain}
                      tone="compact"
                    />
                  )}
                </div>
              </aside>
            </div>
          </div>

          {isFocusBlurred && (
            <div className="focus-shield" role="status" aria-live="polite">
              <div>
                <EyeOff aria-hidden="true" />
                <h2>Exam hidden while focus is away</h2>
                <p>
                  Leaving the tab or window blurs the active question and records
                  a focus-loss event. The timer continues.
                </p>
                <button
                  type="button"
                  className="exam-button is-primary"
                  onClick={() => {
                    focusLostRef.current = false;
                    setIsFocusBlurred(false);
                  }}
                >
                  Resume exam
                </button>
              </div>
            </div>
          )}
        </section>
      </>
    );
  }

  if (screen === "result") {
    const scoreRingStyle = {
      "--score-angle": `${scoring.percentage * 3.6}deg`,
    } as CSSProperties;
    const passed = scoring.passed;
    const heading = passed
      ? "Strong run — you cleared the benchmark"
      : "Keep going — here's where to tighten up";
    const focusNote =
      focusLossCount > 0
        ? ` You switched tabs ${focusLossCount} time${focusLossCount === 1 ? "" : "s"} during the session — a real proctor would have flagged that.`
        : " You kept focus the entire session — nicely disciplined.";
    const radarData = domainBreakdown.map((domain) => ({
      label: shortDomainLabel(domain.label),
      value: domain.percentage,
    }));
    const lockCopy = reviewUnlocked
      ? "Review mode unlocked: every question was answered or skipped before submit."
      : unansweredCount > 0
        ? `You left ${unansweredCount} question${unansweredCount === 1 ? "" : "s"} unanswered. Finish all ${scoring.total} questions and submit to unlock explanations.`
        : "Submit a fully completed session to unlock explanations.";

    return (
      <>
        <ExamPageHead eyebrow={pageHead.eyebrow} title={pageHead.title} />
        <section className="exam-shell" aria-labelledby="result-title">
          <header className="session-bar">
            <div className="session-brand">
              <span className="brand-mark" aria-hidden="true">
                CA
              </span>
              <div>
                <strong>Sample Claude Exams - Session</strong>
                <code>{sessionId}</code>
              </div>
            </div>
            <time className="session-timer" dateTime={`PT${elapsedSeconds}S`}>
              <Clock aria-hidden="true" />
              {formatDuration(elapsedSeconds)}
            </time>
          </header>

          <section
            className={
              passed ? "score-panel is-pass" : "score-panel is-review"
            }
          >
            <div className="score-ring-col">
              <div
                className="score-ring"
                style={scoreRingStyle}
                role="img"
                aria-label={`Score ${scoring.scaledScore} out of ${bank.settings.scoreScale}`}
              >
                <div>
                  <strong>{scoring.scaledScore}</strong>
                  <span> of {bank.settings.scoreScale}</span>
                </div>
              </div>
              <div className="score-pct-pill">{scoring.percentage}% correct</div>
            </div>
            <div className="result-copy">
              <div className="result-badges">
                <span
                  className={
                    passed
                      ? "threshold-badge is-pass"
                      : "threshold-badge is-fail"
                  }
                >
                  {passed ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <XCircle aria-hidden="true" />
                  )}
                  {passed ? "Above threshold" : "Below threshold"}
                </span>
                <span className="result-session-chip">{sessionId}</span>
              </div>
              <h2 id="result-title">{heading}</h2>
              <p>
                You answered {scoring.correct} of {scoring.total} correctly (
                {scoring.percentage}%). On the {scaleLabel}-point scale that's{" "}
                {scoring.scaledScore}. This mock uses {bank.settings.passingScore}{" "}
                as a working pass benchmark; Anthropic doesn't publish the
                official cut score.{focusNote}
              </p>
              <div className="result-stat-grid">
                <div className="result-stat">
                  <strong>{scoring.correct}</strong>
                  <span>Correct</span>
                </div>
                <div className="result-stat">
                  <strong>{scoring.incorrect}</strong>
                  <span>Incorrect</span>
                </div>
                <div className="result-stat">
                  <strong>{unansweredCount}</strong>
                  <span>Unanswered</span>
                </div>
                <div className="result-stat">
                  <strong>{formatDuration(elapsedSeconds)}</strong>
                  <span>Time used</span>
                </div>
              </div>
              <div
                className={
                  reviewUnlocked
                    ? "review-lock-callout is-unlocked"
                    : "review-lock-callout is-locked"
                }
              >
                {reviewUnlocked ? (
                  <Unlock aria-hidden="true" />
                ) : (
                  <Lock aria-hidden="true" />
                )}
                <span>{lockCopy}</span>
              </div>
            </div>
          </section>

          <div className="result-lower">
            <section className="perf-radar-card" aria-label="Performance radar">
              <div className="perf-radar-head">
                <BarChart3 aria-hidden="true" />
                Performance Radar
              </div>
              {radarData.length >= 3 ? (
                <div className="perf-radar-wrap">
                  <PerformanceRadar data={radarData} />
                </div>
              ) : (
                <p className="result-copy" style={{ marginTop: "0.8rem" }}>
                  <span>
                    A full multi-domain radar appears after a complete 60-question
                    mock. This targeted set covers a single domain — see the
                    breakdown below.
                  </span>
                </p>
              )}
            </section>

            <aside className="result-side">
              <dl className="result-kpis">
                <div>
                  <dt>Answered</dt>
                  <dd>{scoring.answered}</dd>
                </div>
                <div>
                  <dt>Flagged</dt>
                  <dd>{flaggedCount}</dd>
                </div>
                <div>
                  <dt>Focus loss</dt>
                  <dd>{focusLossCount}</dd>
                </div>
              </dl>
              <div className="result-buttons">
                <button
                  type="button"
                  className={
                    reviewUnlocked
                      ? "exam-button is-primary"
                      : "exam-button is-primary is-locked"
                  }
                  disabled={!reviewUnlocked}
                  onClick={() => setScreen("review")}
                >
                  {reviewUnlocked ? (
                    <ListChecks className="button-icon" aria-hidden="true" />
                  ) : (
                    <Lock className="button-icon" aria-hidden="true" />
                  )}
                  {reviewUnlocked ? "Review explanations" : "Review locked"}
                </button>
                <button
                  type="button"
                  className="exam-button"
                  onClick={copyResult}
                >
                  <Copy className="button-icon" aria-hidden="true" />
                  {shareCopied ? "Copied" : "Copy score"}
                </button>
                <button type="button" className="exam-button" onClick={retake}>
                  <RotateCcw className="button-icon" aria-hidden="true" />
                  Retake
                </button>
              </div>
            </aside>
          </div>

          <section className="domain-panel" aria-labelledby="domain-title">
            <h2 id="domain-title">Domain Breakdown</h2>
            <div className="domain-list">
              {domainBreakdown.map((domain) => (
                <div className="domain-row" key={domain.id}>
                  <div>
                    <strong>{domain.label}</strong>
                    <span>
                      {domain.correct}/{domain.total} correct / {domain.skipped}{" "}
                      skipped / {domain.open} open / target{" "}
                      {domain.targetQuestionCount} ({domain.weightPercent}%)
                    </span>
                  </div>
                  <div className="domain-meter" aria-hidden="true">
                    <span
                      style={
                        {
                          "--bar-width": `${domain.percentage}%`,
                        } as CSSProperties
                      }
                    />
                  </div>
                  <b>{domain.percentage}%</b>
                </div>
              ))}
            </div>
          </section>
        </section>
      </>
    );
  }

  return (
    <>
      <ExamPageHead eyebrow={pageHead.eyebrow} title={pageHead.title} />
      <section className="exam-shell" aria-labelledby="review-title">
        <header className="session-bar">
          <div className="session-brand">
            <span className="brand-mark" aria-hidden="true">
              CA
            </span>
            <div>
              <strong>Sample Claude Exams - Session</strong>
              <code>{sessionId}</code>
            </div>
          </div>
          <time className="session-timer" dateTime={`PT${elapsedSeconds}S`}>
            <Clock aria-hidden="true" />
            {formatDuration(elapsedSeconds)}
          </time>
        </header>
        <div className="review-toolbar">
          <div>
            <p className="toolbar-kicker">Answer review</p>
            <h2 id="review-title">Explanations</h2>
          </div>
          <div className="review-actions">
            <div
              className="segmented-control"
              role="tablist"
              aria-label="Review filter"
            >
              {(["all", "missed", "skipped", "flagged"] as const).map(
                (filter) => (
                  <button
                    type="button"
                    key={filter}
                    role="tab"
                    aria-selected={reviewFilter === filter}
                    className={reviewFilter === filter ? "is-active" : undefined}
                    onClick={() => setReviewFilter(filter)}
                  >
                    {filter}
                  </button>
                )
              )}
            </div>
            <button
              type="button"
              className="exam-button is-compact"
              aria-pressed={showGuide}
              onClick={() => setShowGuide((value) => !value)}
            >
              {showGuide ? (
                <EyeOff className="button-icon" aria-hidden="true" />
              ) : (
                <Eye className="button-icon" aria-hidden="true" />
              )}
              {showGuide ? "Hide guide" : "Show guide"}
            </button>
            <button
              type="button"
              className="exam-button is-compact"
              onClick={() => setScreen("result")}
            >
              <ArrowLeft className="button-icon" aria-hidden="true" />
              Score
            </button>
            <button
              type="button"
              className="exam-button is-primary is-compact"
              onClick={retake}
            >
              <RotateCcw className="button-icon" aria-hidden="true" />
              Retake
            </button>
          </div>
        </div>

        <div className="review-list">
          {reviewQuestions.length === 0 ? (
            <div className="empty-review">
              <p>No questions match this filter.</p>
            </div>
          ) : (
            reviewQuestions.map((question, index) => {
              const result = getQuestionResult(question, answers, skips);
              const domain = getQuestionDomain(bank, question);

              return (
                <article className="review-item" key={question.id}>
                  <header className="review-item-header">
                    <div>
                      <span className="review-number">
                        Question {question.sourceOrder}
                      </span>
                      <span className="review-domain">{domain?.label}</span>
                    </div>
                    <span
                      className={
                        result.isCorrect
                          ? "review-state is-correct"
                          : result.isAnswered
                            ? "review-state is-wrong"
                            : result.isSkipped
                              ? "review-state is-skipped"
                              : "review-state"
                      }
                    >
                      {result.isCorrect
                        ? "Correct"
                        : result.isAnswered
                          ? "Incorrect"
                          : result.isSkipped
                            ? "Skipped"
                            : "Open"}
                    </span>
                  </header>
                  <h3>
                    <FormattedText text={question.prompt} />
                  </h3>
                  {showGuide && (
                    <GuideReferencePanel question={question} domain={domain} />
                  )}
                  <div
                    className="answer-list is-review"
                    aria-label={`Review answers for ${question.id}`}
                  >
                    {question.choices.map((choice) => (
                      <div
                        className={getChoiceClass(
                          choice,
                          question,
                          answers,
                          skips,
                          true
                        )}
                        key={choice.id}
                      >
                        <span className="choice-letter">{choice.id}</span>
                        <span className="choice-copy">
                          <FormattedText text={choice.text} />
                          <small>
                            <FormattedText text={choice.explanation} />
                          </small>
                        </span>
                        {choice.isCorrect && (
                          <span className="answer-tag">Correct answer</span>
                        )}
                        {result.selected === choice.id && (
                          <span className="answer-tag is-picked">Your pick</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {index < reviewQuestions.length - 1 && <hr />}
                </article>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}
