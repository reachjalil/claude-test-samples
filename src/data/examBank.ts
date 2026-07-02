import rawFormB from "./question-banks/claude-architect-foundations.form-b.json";
import rawFormC from "./question-banks/claude-architect-foundations.form-c.json";
import rawFormD from "./question-banks/claude-architect-foundations.form-d.json";
import rawBank from "./question-banks/claude-architect-foundations.sample.json";
import type { ExamBank } from "./examTypes";

export const examBank = rawBank as ExamBank;
export const examBanks = [
  examBank,
  rawFormB as ExamBank,
  rawFormC as ExamBank,
  rawFormD as ExamBank,
];
export const examBanksById = new Map(
  examBanks.map((bank) => [bank.bankId, bank])
);
