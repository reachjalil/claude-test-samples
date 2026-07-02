import rawStudyGuide from "./study-guide/foundations-guide.json";

export type StudyGuide = typeof rawStudyGuide;
export type StudyGuideDomain = StudyGuide["domains"][number];
export type StudyGuideTaskStatement =
  StudyGuideDomain["taskStatements"][number];
export type StudyGuideScenario = StudyGuide["scenarios"][number];
export type StudyGuideExercise = StudyGuide["preparationExercises"][number];

export const studyGuide = rawStudyGuide;

export const studyGuideDomainsById = new Map(
  studyGuide.domains.map((domain) => [domain.id, domain])
);

export const studyGuideTasksById = new Map(
  studyGuide.domains.flatMap((domain) =>
    domain.taskStatements.map((task) => [task.id, { ...task, domain }])
  )
);

export const studyGuideScenariosById = new Map(
  studyGuide.scenarios.map((scenario) => [scenario.id, scenario])
);
