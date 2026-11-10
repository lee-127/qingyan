export const SUBJECTS = ["数学", "英语", "政治", "专业课"];
export const MATERIAL_TYPES = ["习题集", "笔记", "真题卷", "模拟卷"];
export const REASONS = [
  "概念不清",
  "方法不熟",
  "计算失误",
  "审题疏漏",
  "知识遗忘",
  "其他",
];
export type Asset = { id: string; name: string; mime: string; size: number };
export type Material = {
  title: string;
  subject: string;
  type: string;
  year: string;
  note: string;
  file: Asset;
  folderId?: string;
};
export type ExerciseFolder = { title: string };
export type Mistake = {
  title: string;
  subject: string;
  topic: string;
  reason: string;
  status: string;
  difficulty: string;
  question: string;
  answer: string;
  reflection: string;
  sourceId: string;
  source: string;
  sourcePage?: number;
  image?: Asset;
  tags: string[];
};
export type Paper = {
  title: string;
  questionIds: string[];
  questions: Mistake[];
  points: number[];
  space: number;
  includeAnswers: boolean;
  note: string;
};
export type Score = {
  title: string;
  subject: string;
  type: string;
  score: number;
  total: number;
  date: string;
  duration: number;
  sourceId: string;
  note: string;
};
export type Settings = { examDate: string; target: string; subjects: string[] };
export type Kind = "material" | "mistake" | "paper" | "score" | "settings" | "folder";
export type Entry<T> = T & { id: string; createdAt: string; updatedAt: string };
export type StudyData = {
  material: Entry<Material>[];
  mistake: Entry<Mistake>[];
  paper: Entry<Paper>[];
  score: Entry<Score>[];
  settings: Entry<Settings>[];
  folder: Entry<ExerciseFolder>[];
};
export const EMPTY: StudyData = {
  material: [],
  mistake: [],
  paper: [],
  score: [],
  settings: [],
  folder: [],
};
export const dateISO = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const percent = (s: Score) =>
  Math.round((s.score / s.total) * 1000) / 10;
