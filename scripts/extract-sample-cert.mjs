import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(scriptDir, "..");
const repoRoot = siteRoot;
const sourcePath = resolve(repoRoot, "tmp/CLAUDE_CERT/SAMPLE_CERT.md");
const studyGuidePath = resolve(
  siteRoot,
  "src/data/study-guide/foundations-guide.json"
);
const outputPath = resolve(
  siteRoot,
  "src/data/question-banks/claude-architect-foundations.sample.json"
);

const studyGuide = JSON.parse(readFileSync(studyGuidePath, "utf8"));

const domains = studyGuide.domains.map((domain) => ({
  id: domain.id,
  number: domain.number,
  label: domain.label,
  description: domain.description,
  weightPercent: domain.weightPercent,
  targetQuestionCount: domain.targetQuestionCount,
  taskStatementIds: domain.taskStatements.map((task) => task.id),
}));

const taskById = new Map(
  studyGuide.domains.flatMap((domain) =>
    domain.taskStatements.map((task) => [task.id, { ...task, domain }])
  )
);

const domainById = new Map(domains.map((domain) => [domain.id, domain]));

const QUESTION_GUIDE_METADATA = {
  Q1: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["1.7", "5.4"],
    guideSummary:
      "Covers crash recovery and stale-session decisions for a partially completed multi-agent research run.",
  },
  Q2: {
    domainId: "context-management-reliability",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["5.1", "5.6"],
    guideSummary:
      "Covers preserving key findings and attribution when raw sources and intermediate summaries exceed context budget.",
  },
  Q3: {
    domainId: "tool-design-mcp-integration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["2.1"],
    guideSummary:
      "Covers splitting generic tools into purpose-specific contracts so extraction, summarization, and verification do not blur together.",
  },
  Q4: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["1.3"],
    guideSummary:
      "Covers explicit context transfer between isolated specialist agents rather than assuming shared memory.",
  },
  Q5: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["1.2"],
    guideSummary:
      "Covers dynamic coordinator routing instead of sending simple work through every subagent in a fixed pipeline.",
  },
  Q6: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["1.3", "5.6"],
    guideSummary:
      "Covers preserving source dates and metadata through subagent handoffs so temporal differences are not flattened.",
  },
  Q7: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["1.3", "5.6"],
    guideSummary:
      "Covers structured context passing from synthesis to report generation while preserving claim-source mappings.",
  },
  Q8: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["1.2", "5.6"],
    guideSummary:
      "Covers coordinator expectations for synthesis output that separates established findings from contested or uncertain ones.",
  },
  Q9: {
    domainId: "context-management-reliability",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["5.6"],
    guideSummary:
      "Covers preventing attribution loss when compressed findings are passed through synthesis and report generation.",
  },
  Q10: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["1.3"],
    guideSummary:
      "Covers the need to include findings directly in a subagent prompt because subagents do not inherit parent context.",
  },
  Q11: {
    domainId: "tool-design-mcp-integration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["2.3", "5.6"],
    guideSummary:
      "Covers scoped data-source agents and synthesis formatting choices for heterogeneous evidence types.",
  },
  Q12: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["1.3"],
    guideSummary:
      "Covers goal-oriented subagent prompts that leave room for adaptive research decisions.",
  },
  Q13: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["1.2", "5.1"],
    guideSummary:
      "Covers avoiding repeated expensive synthesis by persisting reusable summaries and routing follow-up work appropriately.",
  },
  Q14: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["1.3", "1.6"],
    guideSummary:
      "Covers parallel subagent spawning and decomposition for independent document or precedent analysis.",
  },
  Q15: {
    domainId: "tool-design-mcp-integration",
    scenarioId: "multi-agent-research-system",
    taskStatementIds: ["1.3", "2.3"],
    guideSummary:
      "Covers configuring the coordinator with Task access so defined subagents can actually be invoked.",
  },
  Q16: {
    domainId: "tool-design-mcp-integration",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["2.4"],
    guideSummary:
      "Covers MCP tool adoption in Claude Code when specialized tools exist but descriptions are not strong enough to guide selection.",
  },
  Q17: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["2.5", "3.4"],
    guideSummary:
      "Covers incremental codebase exploration with Grep and follow-up searches for wrapper names before risky removal work.",
  },
  Q18: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["5.4", "3.4"],
    guideSummary:
      "Covers long exploration sessions, context degradation, scratchpads, and subagent isolation.",
  },
  Q19: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "code-generation-with-claude-code",
    taskStatementIds: ["1.7"],
    guideSummary:
      "Covers named session resumption for a valid ongoing Claude Code investigation.",
  },
  Q20: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["5.4", "3.4"],
    guideSummary:
      "Covers starting a fresh phase with a structured summary when prior exploration context is no longer relevant enough.",
  },
  Q21: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "code-generation-with-claude-code",
    taskStatementIds: ["1.7"],
    guideSummary:
      "Covers telling resumed sessions what files changed so stale tool results are not trusted.",
  },
  Q22: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "code-generation-with-claude-code",
    taskStatementIds: ["1.7", "3.4"],
    guideSummary:
      "Covers forking sessions to compare divergent implementation approaches from a shared baseline.",
  },
  Q23: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["5.4", "2.5"],
    guideSummary:
      "Covers codebase exploration strategies that combine search, targeted reads, scratchpads, and scoped subagents.",
  },
  Q24: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["3.4", "5.4"],
    guideSummary:
      "Covers using planning and exploration isolation for a broad test-gap analysis across many files.",
  },
  Q25: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["1.6", "2.5"],
    guideSummary:
      "Covers adaptive decomposition for open-ended debugging where the agent must trace unknown dependencies.",
  },
  Q26: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["1.7"],
    guideSummary:
      "Covers session recovery after interruption and accounting for changed files before continuing.",
  },
  Q27: {
    domainId: "tool-design-mcp-integration",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["2.1", "2.4"],
    guideSummary:
      "Covers improving MCP refactoring tool names and descriptions so Claude prefers them over weaker text manipulation.",
  },
  Q28: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["1.7", "3.4"],
    guideSummary:
      "Covers using forked branches from a shared analysis baseline to compare testing strategies.",
  },
  Q29: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["2.5"],
    guideSummary:
      "Covers fallback from Edit to Read plus Write when target text is not uniquely matchable.",
  },
  Q30: {
    domainId: "claude-code-configuration-workflows",
    scenarioId: "developer-productivity-with-claude",
    taskStatementIds: ["3.4", "5.4"],
    guideSummary:
      "Covers choosing plan-oriented exploration for a broad architecture understanding task before making changes.",
  },
  Q31: {
    domainId: "context-management-reliability",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["1.7", "5.1"],
    guideSummary:
      "Covers avoiding stale tool results in a returning customer session and refreshing facts before responding.",
  },
  Q32: {
    domainId: "context-management-reliability",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["5.2"],
    guideSummary:
      "Covers explicit escalation criteria instead of sentiment or self-reported confidence heuristics.",
  },
  Q33: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["1.4"],
    guideSummary:
      "Covers structured human handoff after investigation identifies a refund that exceeds authorization.",
  },
  Q34: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["1.5"],
    guideSummary:
      "Covers deterministic hook-based enforcement for refund thresholds that cannot rely on prompt compliance.",
  },
  Q35: {
    domainId: "context-management-reliability",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["2.2", "5.3"],
    guideSummary:
      "Covers transient tool failure handling, local recovery, and preserving partial results for coordinator decisions.",
  },
  Q36: {
    domainId: "context-management-reliability",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["5.2"],
    guideSummary:
      "Covers honoring explicit requests for a human agent even when the underlying case appears straightforward.",
  },
  Q37: {
    domainId: "context-management-reliability",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["5.1"],
    guideSummary:
      "Covers persisting verification facts in a stable case-facts layer to avoid repeating multi-step context.",
  },
  Q38: {
    domainId: "tool-design-mcp-integration",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["2.2", "5.3"],
    guideSummary:
      "Covers structured error categories and retryability so order lookup failures drive appropriate recovery.",
  },
  Q39: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["1.1"],
    guideSummary:
      "Covers model-driven next-action selection inside the agentic loop after a tool result is appended.",
  },
  Q40: {
    domainId: "context-management-reliability",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["5.2"],
    guideSummary:
      "Covers immediate escalation when the customer explicitly asks for a real person.",
  },
  Q41: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["1.4"],
    guideSummary:
      "Covers handoff protocols after an agent determines a case exceeds its authorization.",
  },
  Q42: {
    domainId: "agentic-architecture-orchestration",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["1.4", "5.1"],
    guideSummary:
      "Covers decomposing and tracking multiple customer issues so later references resolve to the correct case facts.",
  },
  Q43: {
    domainId: "tool-design-mcp-integration",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["2.2"],
    guideSummary:
      "Covers returning MCP isError plus structured metadata for backend failures.",
  },
  Q44: {
    domainId: "tool-design-mcp-integration",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["2.2"],
    guideSummary:
      "Covers separating transient technical errors from non-retryable business-rule errors in tool responses.",
  },
  Q45: {
    domainId: "tool-design-mcp-integration",
    scenarioId: "customer-support-resolution-agent",
    taskStatementIds: ["5.1", "2.1"],
    guideSummary:
      "Covers trimming verbose tool outputs and designing tool responses around relevant fields before context is consumed.",
  },
  Q46: {
    domainId: "tool-design-mcp-integration",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.5", "2.3"],
    guideSummary:
      "Covers matching processing strategy to latency needs when one extraction workload is archival and another is urgent.",
  },
  Q47: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.1", "4.3"],
    guideSummary:
      "Covers explicit normalization criteria for structured array fields when schemas alone do not define semantic splitting.",
  },
  Q48: {
    domainId: "context-management-reliability",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["5.5"],
    guideSummary:
      "Covers validating confidence-based automation by document type and field before reducing human review.",
  },
  Q49: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.4"],
    guideSummary:
      "Covers semantic validation for conflicting source terms and explicit conflict indicators.",
  },
  Q50: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.4"],
    guideSummary:
      "Covers when retry-with-error-feedback helps and when absent source information requires a different path.",
  },
  Q51: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.3"],
    guideSummary:
      "Covers schema-backed structured output plus prompt-level normalization for inconsistent source formats.",
  },
  Q52: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.3"],
    guideSummary:
      "Covers nullable fields and anti-fabrication behavior when documents omit values.",
  },
  Q53: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.3", "4.4"],
    guideSummary:
      "Covers the distinction between JSON syntax validity and semantic completeness of extracted values.",
  },
  Q54: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.4"],
    guideSummary:
      "Covers validation fields that compare calculated totals against stated totals to catch semantic extraction errors.",
  },
  Q55: {
    domainId: "tool-design-mcp-integration",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.3", "2.3"],
    guideSummary:
      "Covers forcing a specific first tool call when extraction must precede enrichment tools.",
  },
  Q56: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.3"],
    guideSummary:
      "Covers enum design with an other-plus-detail pattern for extensible categories.",
  },
  Q57: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.2", "4.3"],
    guideSummary:
      "Covers few-shot examples and explicit extraction rules for consistent structured fields.",
  },
  Q58: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.5"],
    guideSummary:
      "Covers Message Batches scheduling against SLA requirements and the 24-hour processing window.",
  },
  Q59: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["5.5", "4.4"],
    guideSummary:
      "Covers routing limited human review toward semantic errors that schema validation does not catch.",
  },
  Q60: {
    domainId: "prompt-engineering-structured-output",
    scenarioId: "structured-data-extraction",
    taskStatementIds: ["4.5"],
    guideSummary:
      "Covers batch failure recovery by custom_id and resubmitting only failed oversized documents with modifications.",
  },
};

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "--")
    .replace(/&ndash;/g, "-");
}

function normalizeAscii(value) {
  return value
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2014/g, "--")
    .replace(/\u2013/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/\u2713/g, "correct")
    .replace(/\u00b1/g, "+/-")
    .replace(/\u2212/g, "-")
    .replace(/\u00d7/g, "x")
    .replace(/\u{1f4ca}/gu, "")
    .replace(/\u{1f389}/gu, "")
    .replace(/\u00a0/g, " ");
}

function textFromHtml(value) {
  return normalizeAscii(
    decodeEntities(value)
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function selectGuideItems(taskIds, key) {
  return unique(
    taskIds.flatMap((taskId) => {
      const task = taskById.get(taskId);
      return task?.[key] ?? [];
    })
  ).slice(0, 5);
}

function buildGuideReferences(taskIds) {
  return taskIds.map((taskId) => {
    const task = taskById.get(taskId);
    if (!task) {
      return `Task ${taskId}`;
    }

    return `Domain ${task.domain.number}, Task ${task.id}: ${task.title}`;
  });
}

function getQuestionMetadata(questionId) {
  const metadata = QUESTION_GUIDE_METADATA[questionId];

  if (!metadata) {
    throw new Error(`Missing study-guide metadata for ${questionId}`);
  }

  if (!domainById.has(metadata.domainId)) {
    throw new Error(`Invalid domain ${metadata.domainId} for ${questionId}`);
  }

  const missingTasks = metadata.taskStatementIds.filter(
    (taskId) => !taskById.has(taskId)
  );

  if (missingTasks.length > 0) {
    throw new Error(
      `Invalid task reference(s) for ${questionId}: ${missingTasks.join(", ")}`
    );
  }

  return {
    ...metadata,
    skills: selectGuideItems(metadata.taskStatementIds, "skills"),
    knowledge: selectGuideItems(metadata.taskStatementIds, "knowledge"),
    guideReferences: buildGuideReferences(metadata.taskStatementIds),
  };
}

function parseQuestions(source) {
  return source
    .split('<div class="review-item">')
    .slice(1)
    .map((part, index) => {
      const id = part.match(/<span class="pill mono">([^<]+)<\/span>/)?.[1];
      const questionHtml = part.match(
        /<div class="review-q">([\s\S]*?)<\/div><div class="r-opt/
      )?.[1];

      if (!id || !questionHtml) {
        return undefined;
      }

      const choices = part
        .split('<div class="r-opt')
        .slice(1)
        .map((segment, choiceIndex) => {
          const classBits = segment.match(/^([^"]*)">/)?.[1] ?? "";
          const choiceHtml =
            segment.match(/<span class="r-text">([\s\S]*?)<\/span>/)?.[1] ?? "";
          const explanationHtml =
            segment.match(/<div class="why">([\s\S]*?)<\/div>/)?.[1] ?? "";

          if (!choiceHtml) {
            return undefined;
          }

          return {
            id: "ABCD"[choiceIndex],
            text: textFromHtml(choiceHtml),
            explanation: textFromHtml(explanationHtml),
            isCorrect: /\bis-correct\b/.test(classBits),
          };
        })
        .filter(Boolean);

      const question = {
        id,
        sourceOrder: index + 1,
        domainId: "",
        scenarioId: "",
        taskStatementIds: [],
        skills: [],
        knowledge: [],
        guideReferences: [],
        guideSummary: "",
        type: "single_choice",
        prompt: textFromHtml(questionHtml),
        choices,
      };
      const metadata = getQuestionMetadata(question.id);

      return {
        ...question,
        ...metadata,
      };
    })
    .filter(Boolean);
}

const source = readFileSync(sourcePath, "utf8");
const questions = parseQuestions(source);
const malformed = questions.filter((question) => {
  return (
    question.choices.length !== 4 ||
    question.choices.filter((choice) => choice.isCorrect).length !== 1
  );
});

if (questions.length !== 60 || malformed.length > 0) {
  throw new Error(
    `Expected 60 single-answer questions with four choices. Parsed ${questions.length}; malformed: ${malformed
      .map((question) => question.id)
      .join(", ")}`
  );
}

const expectedIds = Object.keys(QUESTION_GUIDE_METADATA).sort();
const parsedIds = questions.map((question) => question.id).sort();
const missingQuestions = expectedIds.filter((id) => !parsedIds.includes(id));
const extraQuestions = parsedIds.filter((id) => !expectedIds.includes(id));

if (missingQuestions.length > 0 || extraQuestions.length > 0) {
  throw new Error(
    `Metadata mismatch. Missing parsed questions: ${missingQuestions.join(", ") || "none"}; extra parsed questions: ${extraQuestions.join(", ") || "none"}`
  );
}

const domainCounts = new Map(
  domains.map((domain) => [
    domain.id,
    questions.filter((question) => question.domainId === domain.id).length,
  ])
);
const distributionMismatches = domains.filter(
  (domain) => domainCounts.get(domain.id) !== domain.targetQuestionCount
);

if (distributionMismatches.length > 0) {
  throw new Error(
    `Question distribution does not match the study-guide blueprint: ${distributionMismatches
      .map(
        (domain) =>
          `${domain.id} expected ${domain.targetQuestionCount}, got ${domainCounts.get(domain.id)}`
      )
      .join("; ")}`
  );
}

const bank = {
  schemaVersion: 1,
  bankId: "claude-architect-foundations-sample",
  title: "Sample Claude Exam - Foundations",
  description:
    "Unofficial 60-question practice bank tagged against the local Claude architecture foundations study guide.",
  source: {
    path: "tmp/CLAUDE_CERT/SAMPLE_CERT.md",
    kind: "local-review-export",
    notes:
      "Questions, choices, correct answers, and per-choice explanations were extracted from rendered review markup.",
  },
  settings: {
    totalQuestions: questions.length,
    durationMinutes: 120,
    scoreScale: 1000,
    passingScore: studyGuide.exam.scoring.passingScore,
  },
  domains,
  questions,
};

writeFileSync(outputPath, `${JSON.stringify(bank, null, 2)}\n`);
execFileSync("pnpm", ["exec", "biome", "format", outputPath, "--write"], {
  cwd: repoRoot,
  stdio: "inherit",
});
console.log(`Extracted ${questions.length} questions to ${outputPath}`);
