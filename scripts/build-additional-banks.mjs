import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(scriptDir, "..");
const repoRoot = siteRoot;
const draftDir = resolve(repoRoot, "tmp/CLAUDE_CERT/generated-question-drafts");
const studyGuidePath = resolve(
  siteRoot,
  "src/data/study-guide/foundations-guide.json"
);
const sampleBankPath = resolve(
  siteRoot,
  "src/data/question-banks/claude-architect-foundations.sample.json"
);
const outputDir = resolve(siteRoot, "src/data/question-banks");

const formConfigs = [
  {
    formId: "form-b",
    bankId: "claude-architect-foundations-form-b",
    title: "Sample Claude Exam - Form B",
    outputFile: "claude-architect-foundations.form-b.json",
  },
  {
    formId: "form-c",
    bankId: "claude-architect-foundations-form-c",
    title: "Sample Claude Exam - Form C",
    outputFile: "claude-architect-foundations.form-c.json",
  },
  {
    formId: "form-d",
    bankId: "claude-architect-foundations-form-d",
    title: "Sample Claude Exam - Form D",
    outputFile: "claude-architect-foundations.form-d.json",
  },
];

const draftFiles = [
  "domain-1-agentic-architecture-orchestration.json",
  "domain-2-tool-design-mcp-integration.json",
  "domain-3-claude-code-configuration-workflows.json",
  "domain-4-prompt-engineering-structured-output.json",
  "domain-5-context-management-reliability.json",
];

const studyGuide = JSON.parse(readFileSync(studyGuidePath, "utf8"));
const sampleBank = JSON.parse(readFileSync(sampleBankPath, "utf8"));
const domains = studyGuide.domains.map((domain) => ({
  id: domain.id,
  number: domain.number,
  label: domain.label,
  description: domain.description,
  weightPercent: domain.weightPercent,
  targetQuestionCount: domain.targetQuestionCount,
  taskStatementIds: domain.taskStatements.map((task) => task.id),
}));
const domainById = new Map(domains.map((domain) => [domain.id, domain]));
const taskById = new Map(
  studyGuide.domains.flatMap((domain) =>
    domain.taskStatements.map((task) => [task.id, { ...task, domain }])
  )
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertAscii(value, context) {
  assert(
    [...value].every((character) => character.charCodeAt(0) <= 127),
    `${context} contains non-ASCII characters`
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
    return `Domain ${task.domain.number}, Task ${task.id}: ${task.title}`;
  });
}

function validateChoiceIds(choices, context) {
  const ids = choices.map((choice) => choice.id).join("");
  assert(ids === "ABCD", `${context} choices must be ordered A-D`);
}

function normalizeChoices(choices, context) {
  if (Array.isArray(choices)) {
    return choices;
  }

  if (choices && typeof choices === "object") {
    return ["A", "B", "C", "D"].map((id) => ({
      id,
      ...choices[id],
    }));
  }

  throw new Error(`${context} choices must be an array or A-D keyed object`);
}

const CANONICAL_SCENARIOS = new Set([
  "customer-support-resolution-agent",
  "code-generation-with-claude-code",
  "multi-agent-research-system",
  "developer-productivity-with-claude",
  "claude-code-for-continuous-integration",
  "structured-data-extraction",
]);

// Map each non-Domain-4 question to one of the six study-guide scenarios by its
// primary task statement so every question stays traceable to the guide
// taxonomy (Domain 4 drafts already use canonical scenario ids). A handful of
// questions whose theme differs from the task default are pinned explicitly.
const SCENARIO_BY_TASK = new Map([
  ["1.1", "customer-support-resolution-agent"],
  ["1.2", "multi-agent-research-system"],
  ["1.3", "multi-agent-research-system"],
  ["1.4", "customer-support-resolution-agent"],
  ["1.5", "customer-support-resolution-agent"],
  ["1.6", "multi-agent-research-system"],
  ["1.7", "code-generation-with-claude-code"],
  ["2.1", "customer-support-resolution-agent"],
  ["2.2", "customer-support-resolution-agent"],
  ["2.3", "customer-support-resolution-agent"],
  ["2.4", "developer-productivity-with-claude"],
  ["2.5", "developer-productivity-with-claude"],
  ["3.1", "code-generation-with-claude-code"],
  ["3.2", "code-generation-with-claude-code"],
  ["3.3", "code-generation-with-claude-code"],
  ["3.4", "code-generation-with-claude-code"],
  ["3.5", "code-generation-with-claude-code"],
  ["3.6", "claude-code-for-continuous-integration"],
  ["5.1", "customer-support-resolution-agent"],
  ["5.2", "customer-support-resolution-agent"],
  ["5.3", "multi-agent-research-system"],
  ["5.4", "developer-productivity-with-claude"],
  ["5.5", "structured-data-extraction"],
  ["5.6", "multi-agent-research-system"],
]);
const SCENARIO_OVERRIDE = new Map([
  ["B-D1-Q16", "multi-agent-research-system"],
  ["C-D1-Q14", "multi-agent-research-system"],
  ["C-D1-Q15", "multi-agent-research-system"],
  ["C-D2-Q05", "multi-agent-research-system"],
  ["D-D1-Q13", "code-generation-with-claude-code"],
  ["B-D5-Q07", "multi-agent-research-system"],
  ["D-D5-Q07", "developer-productivity-with-claude"],
]);

function canonicalScenarioId(generatedId, domainId, question) {
  const scenarioId =
    domainId === "prompt-engineering-structured-output"
      ? question.scenarioId // Domain 4 drafts already use canonical scenario ids
      : (SCENARIO_OVERRIDE.get(generatedId) ??
        SCENARIO_BY_TASK.get(question.taskStatementIds[0]));
  assert(
    CANONICAL_SCENARIOS.has(scenarioId),
    `${generatedId} mapped to non-canonical scenario ${scenarioId}`
  );
  return scenarioId;
}

// Deterministic PRNG so repeated builds produce identical answer-key layouts.
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FORM_SEEDS = { "form-b": 1001, "form-c": 1002, "form-d": 1003 };

// Spread the correct answer evenly across A-D (15 each for a 60-question form)
// instead of leaving it wherever the draft authored it, so no single position
// is a reliable guess. Distractors keep their relative order; ids relabel A-D.
function rebalanceAnswerPositions(questions, formId) {
  const total = questions.length;
  assert(total % 4 === 0, `${formId} expects a multiple of four questions`);
  const targets = [];
  for (let i = 0; i < total / 4; i += 1) {
    targets.push(0, 1, 2, 3);
  }
  const random = mulberry32(FORM_SEEDS[formId]);
  for (let i = targets.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [targets[i], targets[j]] = [targets[j], targets[i]];
  }
  const letters = ["A", "B", "C", "D"];
  questions.forEach((question, questionIndex) => {
    const target = targets[questionIndex];
    const correct = question.choices.find((choice) => choice.isCorrect);
    const distractors = question.choices.filter((choice) => !choice.isCorrect);
    const slots = [null, null, null, null];
    slots[target] = correct;
    let distractorIndex = 0;
    for (let i = 0; i < slots.length; i += 1) {
      if (slots[i] === null) {
        slots[i] = distractors[distractorIndex];
        distractorIndex += 1;
      }
    }
    slots.forEach((choice, slotIndex) => {
      choice.id = letters[slotIndex];
    });
    question.choices = slots;
  });
}

function validateDraftQuestion(question, domain, context) {
  assert(
    typeof question.scenarioId === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(question.scenarioId),
    `${context} has invalid scenarioId ${question.scenarioId}`
  );
  assert(
    Array.isArray(question.taskStatementIds) &&
      question.taskStatementIds.length > 0,
    `${context} must reference at least one task statement`
  );
  const taskDomains = question.taskStatementIds.map((taskId) => {
    const task = taskById.get(taskId);
    assert(task, `${context} references unknown task ${taskId}`);
    return task.domain.id;
  });
  assert(
    taskDomains.includes(domain.id),
    `${context} must include at least one task from ${domain.id}`
  );
  assert(
    typeof question.prompt === "string" && question.prompt.length > 80,
    `${context} prompt is too short`
  );
  assert(
    typeof question.guideSummary === "string" &&
      question.guideSummary.length > 20,
    `${context} guideSummary is too short`
  );
  const choices = normalizeChoices(question.choices, context);
  assert(choices.length === 4, `${context} must have four choices`);
  validateChoiceIds(choices, context);
  assert(
    choices.filter((choice) => choice.isCorrect).length === 1,
    `${context} must have exactly one correct answer`
  );
  for (const choice of choices) {
    assert(
      typeof choice.text === "string" && choice.text.length > 20,
      `${context} choice ${choice.id} text is too short`
    );
    assert(
      typeof choice.explanation === "string" && choice.explanation.length > 20,
      `${context} choice ${choice.id} explanation is too short`
    );
  }
  assertAscii(JSON.stringify(question), context);
}

function readDrafts() {
  return draftFiles.map((fileName) => {
    const draftPath = resolve(draftDir, fileName);
    assert(existsSync(draftPath), `Missing domain draft ${draftPath}`);
    const draft = JSON.parse(readFileSync(draftPath, "utf8"));
    const domain = domainById.get(draft.domainId);
    assert(domain, `${fileName} has invalid domainId ${draft.domainId}`);
    assert(
      draft.domainLabel === domain.label,
      `${fileName} domainLabel does not match study guide`
    );

    for (const form of formConfigs) {
      const questions = draft.sets?.[form.formId];
      assert(Array.isArray(questions), `${fileName} missing ${form.formId}`);
      assert(
        questions.length === domain.targetQuestionCount,
        `${fileName} ${form.formId} expected ${domain.targetQuestionCount}, got ${questions.length}`
      );
      questions.forEach((question, index) =>
        validateDraftQuestion(
          question,
          domain,
          `${fileName} ${form.formId} question ${index + 1}`
        )
      );
    }

    return { domain, draft };
  });
}

function interleaveByDomain(questionGroups) {
  const ordered = [];
  const maxLength = Math.max(...questionGroups.map((group) => group.length));

  for (let index = 0; index < maxLength; index += 1) {
    for (const group of questionGroups) {
      const question = group[index];
      if (question) {
        ordered.push(question);
      }
    }
  }

  return ordered.map((question, index) => ({
    ...question,
    sourceOrder: index + 1,
  }));
}

function buildFormBank(form, drafts) {
  const domainQuestionGroups = drafts.map(({ domain, draft }) => {
    return draft.sets[form.formId].map((question, index) => {
      const id = `${form.formId.replace("form-", "").toUpperCase()}-D${domain.number}-Q${String(index + 1).padStart(2, "0")}`;
      return {
        id,
        sourceOrder: 0,
        domainId: domain.id,
        scenarioId: canonicalScenarioId(id, domain.id, question),
        taskStatementIds: question.taskStatementIds,
        skills: selectGuideItems(question.taskStatementIds, "skills"),
        knowledge: selectGuideItems(question.taskStatementIds, "knowledge"),
        guideReferences: buildGuideReferences(question.taskStatementIds),
        guideSummary: question.guideSummary,
        type: "single_choice",
        prompt: question.prompt,
        choices: normalizeChoices(
          question.choices,
          `${form.formId} ${domain.id} question ${index + 1}`
        ),
      };
    });
  });

  const questions = interleaveByDomain(domainQuestionGroups);
  rebalanceAnswerPositions(questions, form.formId);
  const promptSet = new Set();
  for (const question of questions) {
    const normalizedPrompt = question.prompt.toLowerCase().replace(/\s+/g, " ");
    assert(
      !promptSet.has(normalizedPrompt),
      `${form.formId} has a duplicate generated prompt`
    );
    promptSet.add(normalizedPrompt);
  }

  const samplePrompts = new Set(
    sampleBank.questions.map((question) =>
      question.prompt.toLowerCase().replace(/\s+/g, " ")
    )
  );
  const copiedPrompts = questions.filter((question) =>
    samplePrompts.has(question.prompt.toLowerCase().replace(/\s+/g, " "))
  );
  assert(
    copiedPrompts.length === 0,
    `${form.formId} includes prompts copied from the sample bank: ${copiedPrompts.map((question) => question.id).join(", ")}`
  );

  for (const domain of domains) {
    const count = questions.filter(
      (question) => question.domainId === domain.id
    ).length;
    assert(
      count === domain.targetQuestionCount,
      `${form.formId} ${domain.id} expected ${domain.targetQuestionCount}, got ${count}`
    );
  }

  return {
    schemaVersion: 1,
    bankId: form.bankId,
    title: form.title,
    description:
      "Generated 60-question variation bank aligned to the Claude architecture foundations study guide.",
    source: {
      path: "tmp/CLAUDE_CERT/generated-question-drafts/",
      kind: "generated-domain-drafts",
      notes:
        "Questions were generated by domain-focused workers, then validated and enriched against the structured study guide.",
    },
    settings: {
      totalQuestions: questions.length,
      durationMinutes: sampleBank.settings.durationMinutes,
      scoreScale: sampleBank.settings.scoreScale,
      passingScore: sampleBank.settings.passingScore,
    },
    domains,
    questions,
  };
}

const drafts = readDrafts();
const outputPaths = [];

for (const form of formConfigs) {
  const bank = buildFormBank(form, drafts);
  const outputPath = resolve(outputDir, form.outputFile);
  writeFileSync(outputPath, `${JSON.stringify(bank, null, 2)}\n`);
  outputPaths.push(outputPath);
}

execFileSync("pnpm", ["exec", "biome", "format", ...outputPaths, "--write"], {
  cwd: repoRoot,
  stdio: "inherit",
});

console.log(
  `Built ${formConfigs.length} additional practice banks: ${outputPaths.join(", ")}`
);
