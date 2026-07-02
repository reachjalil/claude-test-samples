import type {
  AnswerMap,
  ExamBank,
  ExamQuestion,
  SkipMap,
} from "../data/examTypes";

export function getCorrectChoice(question: ExamQuestion) {
  return question.choices.find((choice) => choice.isCorrect);
}

export function getQuestionResult(
  question: ExamQuestion,
  answers: AnswerMap,
  skips: SkipMap = {}
) {
  const selected = answers[question.id];
  const correct = getCorrectChoice(question);
  const isAnswered = Boolean(selected);
  const isSkipped = !isAnswered && Boolean(skips[question.id]);

  return {
    selected,
    correctId: correct?.id,
    isAnswered,
    isSkipped,
    isCorrect: Boolean(selected && correct && selected === correct.id),
  };
}

export function scoreExam(
  bank: ExamBank,
  answers: AnswerMap,
  skips: SkipMap = {}
) {
  const total = bank.questions.length;
  const correct = bank.questions.filter((question) => {
    return getQuestionResult(question, answers).isCorrect;
  }).length;
  const answered = bank.questions.filter(
    (question) => answers[question.id]
  ).length;
  const skipped = bank.questions.filter((question) => {
    return !answers[question.id] && skips[question.id];
  }).length;
  const open = total - answered - skipped;
  const incorrect = answered - correct;
  const scaledScore = Math.round(
    (correct / Math.max(total, 1)) * bank.settings.scoreScale
  );
  const percentage = Math.round((correct / Math.max(total, 1)) * 100);

  return {
    total,
    answered,
    correct,
    incorrect,
    skipped,
    open,
    complete: open === 0,
    scaledScore,
    percentage,
    passed: scaledScore >= bank.settings.passingScore,
  };
}

export function getDomainBreakdown(
  bank: ExamBank,
  answers: AnswerMap,
  skips: SkipMap = {}
) {
  return bank.domains
    .map((domain) => {
      const questions = bank.questions.filter(
        (question) => question.domainId === domain.id
      );
      const correct = questions.filter((question) => {
        return getQuestionResult(question, answers).isCorrect;
      }).length;
      const answered = questions.filter(
        (question) => answers[question.id]
      ).length;
      const skipped = questions.filter((question) => {
        return !answers[question.id] && skips[question.id];
      }).length;
      const open = questions.length - answered - skipped;
      const percentage =
        questions.length > 0
          ? Math.round((correct / questions.length) * 100)
          : 0;

      return {
        ...domain,
        total: questions.length,
        answered,
        correct,
        skipped,
        open,
        percentage,
      };
    })
    .filter((domain) => domain.total > 0);
}

export function formatDuration(seconds: number) {
  const bounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(bounded / 3600);
  const minutes = Math.floor((bounded % 3600) / 60);
  const secs = bounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function getPassingRatio(bank: ExamBank) {
  return bank.settings.passingScore / bank.settings.scoreScale;
}
