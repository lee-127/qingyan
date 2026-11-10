import { z } from "zod";
const short = z.string().trim().min(1).max(200);
const optional = z.string().max(20000).default("");
const asset = z.object({
  id: z.string().uuid(),
  name: short,
  mime: z.string().max(200),
  size: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
});
export const mistakeSchema = z
  .object({
    title: short,
    subject: short,
    topic: short,
    reason: z.enum([
      "概念不清",
      "方法不熟",
      "计算失误",
      "审题疏漏",
      "知识遗忘",
      "其他",
    ]),
    status: z.enum(["待复习", "巩固中", "已掌握"]),
    difficulty: z.enum(["基础", "中等", "进阶"]),
    question: optional,
    answer: optional,
    reflection: optional,
    sourceId: z.string().max(100).default(""),
    source: z.string().max(200).default(""),
    sourcePage: z.number().int().min(1).max(100000).optional(),
    image: asset.optional(),
    tags: z.array(z.string().max(40)).max(20).default([]),
  })
  .refine((x) => !!x.question.trim() || !!x.image, "请填写题干或上传题目图片");
export const schemas = {
  material: z.object({
    title: short,
    subject: short,
    type: z.enum(["习题集", "笔记", "真题卷", "模拟卷"]),
    year: z.string().max(20).default(""),
    note: optional,
    file: asset,
    folderId: z.string().uuid().or(z.literal("")).optional(),
  }),
  folder: z.object({ title: short }),
  mistake: mistakeSchema,
  paper: z
    .object({
      title: short,
      questionIds: z.array(z.string().min(1)).min(1).max(100),
      questions: z.array(mistakeSchema).min(1).max(100),
      points: z.array(z.number().min(0).max(1000)).min(1).max(100),
      space: z.number().int().min(0).max(12),
      includeAnswers: z.boolean(),
      note: optional,
    })
    .refine(
      (x) =>
        x.questions.length === x.points.length &&
        x.questions.length === x.questionIds.length,
      "组卷题目与分值不一致",
    ),
  score: z
    .object({
      title: short,
      subject: short,
      type: z.enum(["真题卷", "模拟卷"]),
      score: z.number().finite().min(0),
      total: z.number().finite().positive().max(1000),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((s) => {
          const d = new Date(s);
          return !isNaN(+d) && d.toISOString().slice(0, 10) === s;
        }, "日期无效"),
      duration: z.number().int().min(0).max(1440),
      sourceId: z.string().max(100).default(""),
      note: optional,
    })
    .refine((x) => x.score <= x.total, "得分不能超过满分"),
  settings: z.object({
    examDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .or(z.literal("")),
    target: z.string().max(100),
    subjects: z.array(short).min(1).max(30),
  }),
};
