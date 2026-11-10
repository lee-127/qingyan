import {
  EMPTY,
  dateISO,
  type StudyData,
  type Mistake,
  type Score,
} from "./models";
// Demo mode is explicit and stays separate from durable personal records.
export function demoData(): StudyData {
  const now = new Date().toISOString();
  const wrap = <T>(data: T, id: string) => ({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  });
  const questions: Mistake[] = [
    {
      title: "用等价无穷小求极限",
      subject: "数学",
      topic: "高等数学 · 极限",
      reason: "方法不熟",
      status: "待复习",
      difficulty: "中等",
      question: "求极限：lim(x→0) (sin x − x cos x) / x³。",
      answer:
        "1/3。由泰勒展开：sin x = x − x³/6 + o(x³)，x cos x = x − x³/2 + o(x³)，两式相减再除以 x³。",
      reflection: "相减结构需要保留到三阶，不能直接将 sin x 替换为 x。",
      sourceId: "",
      source: "示例练习题",
      tags: ["泰勒公式", "等价无穷小"],
    },
    {
      title: "特征值与矩阵的迹",
      subject: "数学",
      topic: "线性代数 · 特征值",
      reason: "概念不清",
      status: "巩固中",
      difficulty: "基础",
      question: "设三阶矩阵 A 的特征值为 1、2、3，求 tr(A²) 与 det(A)。",
      answer: "tr(A²) = 1² + 2² + 3² = 14；det(A) = 1 × 2 × 3 = 6。",
      reflection: "矩阵幂的特征值是原特征值的相应次幂。",
      sourceId: "",
      source: "示例练习题",
      tags: ["矩阵", "特征值"],
    },
    {
      title: "长难句中的让步关系",
      subject: "英语",
      topic: "阅读理解 · 逻辑关系",
      reason: "审题疏漏",
      status: "待复习",
      difficulty: "中等",
      question:
        "翻译并分析：While the evidence remains limited, the findings suggest that consistent practice may improve performance.",
      answer:
        "尽管证据仍然有限，这些发现表明持续练习可能提高表现。While 在此引导让步状语从句。",
      reflection: "先判断逻辑关系，再分析主干，保留 may 的不确定语气。",
      sourceId: "",
      source: "示例阅读练习",
      tags: ["让步", "长难句"],
    },
    {
      title: "条件概率的样本空间",
      subject: "数学",
      topic: "概率论 · 条件概率",
      reason: "概念不清",
      status: "已掌握",
      difficulty: "基础",
      question: "已知 P(A)=0.5，P(B)=0.4，P(A∩B)=0.2，求 P(A|B)。",
      answer: "P(A|B) = P(A∩B) / P(B) = 0.5。",
      reflection: "条件概率的分母是条件事件 B 的概率。",
      sourceId: "",
      source: "示例练习题",
      tags: ["条件概率"],
    },
  ];
  const scores: Score[] = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(`${dateISO()}T12:00:00+08:00`);
    d.setDate(d.getDate() - (7 - i) * 5);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    scores.push({
      title: `${i % 2 ? "真题" : "模拟"}练习 ${i + 1}`,
      subject: "数学",
      type: i % 2 ? "真题卷" : "模拟卷",
      score: [87, 99, 94, 108, 103, 118, 112, 123][i],
      total: 150,
      date,
      duration: 180,
      sourceId: "",
      note: "示例成绩，用于预览图表",
    });
  }
  return {
    ...EMPTY,
    mistake: questions.map((q, i) => wrap(q, `demo-q-${i}`)),
    score: scores.map((s, i) => wrap(s, `demo-s-${i}`)),
  };
}
