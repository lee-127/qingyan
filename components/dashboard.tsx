"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  NotebookPen,
  Files,
  BarChart3,
  Plus,
  FileText,
  Target,
  Sparkles,
  ChevronRight,
  Sprout,
  CircleCheck,
  Clock3,
} from "lucide-react";
import { Button, Badge, Empty, Select } from "./ui";
import { ScoreChart } from "./charts";
import {
  SUBJECTS,
  percent,
  dateISO,
  type StudyData,
  type Kind,
} from "@/lib/models";
export function Dashboard({
  data,
  subjects,
  onNav,
  onAdd,
  onDemo,
  onSettings,
}: {
  data: StudyData;
  subjects: string[];
  onNav: (page: string) => void;
  onAdd: (kind: Kind) => void;
  onDemo: () => void;
  onSettings: () => void;
}) {
  const [chartSubject, setChartSubject] = useState("全部科目");
  const setting = data.settings[0];
  const days = setting?.examDate
    ? Math.max(
        0,
        Math.ceil(
          (new Date(setting.examDate + "T00:00:00+08:00").getTime() -
            new Date(dateISO() + "T00:00:00+08:00").getTime()) /
            86400000,
        ),
      )
    : null;
  const stats = [
    {
      name: "资料总数",
      value: data.material.length,
      unit: "份",
      icon: BookOpen,
      sub: "你的专属复习资料库",
      page: "library",
      color: 0,
    },
    {
      name: "已归档错题",
      value: data.mistake.length,
      unit: "道",
      icon: NotebookPen,
      sub: `${data.mistake.filter((m) => m.status !== "已掌握").length} 道还需巩固`,
      page: "mistakes",
      color: 1,
    },
    {
      name: "生成练习卷",
      value: data.paper.length,
      unit: "份",
      icon: Files,
      sub: "每一份练习都有针对性",
      page: "builder",
      color: 2,
    },
    {
      name: "累计自测",
      value: data.score.length,
      unit: "次",
      icon: BarChart3,
      sub: "每次坚持，都有记录",
      page: "scores",
      color: 3,
    },
  ];
  const mastered = data.mistake.filter((m) => m.status === "已掌握").length;
  const rate = data.mistake.length
    ? Math.round((mastered / data.mistake.length) * 100)
    : 0;
  const topics = Object.entries(
    data.mistake
      .filter((m) => m.status !== "已掌握")
      .reduce(
        (a, m) => ({ ...a, [m.topic]: (a[m.topic] || 0) + 1 }),
        {} as Record<string, number>,
      ),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const chartScores = data.score.filter(
    (s) => chartSubject === "全部科目" || s.subject === chartSubject,
  );
  return (
    <>
      <div className="welcome">
        <div>
          <div className="welcome-kicker">
            <span className="tiny-leaf">
              <Sprout size={14} />
            </span>
            每天一点，离目标更近一点
          </div>
          <h1>
            把努力，变成看得见的进步<span>。</span>
          </h1>
          <p>从一份资料、一道错题开始，慢慢构建你的知识版图。</p>
        </div>
        <div className="date-stamp">
          <span>
            {new Intl.DateTimeFormat("zh-CN", {
              timeZone: "Asia/Shanghai",
              month: "long",
              day: "numeric",
            }).format(new Date())}
          </span>
          <small>
            {new Intl.DateTimeFormat("zh-CN", {
              timeZone: "Asia/Shanghai",
              weekday: "long",
            }).format(new Date())}
          </small>
        </div>
      </div>
      <div className="stats-grid">
        {stats.map((s) => (
          <button
            className="stat-card"
            key={s.name}
            onClick={() => onNav(s.page)}
          >
            <div className="stat-top">
              <span>{s.name}</span>
              <span className={`tile-icon color-${s.color}`}>
                <s.icon size={19} />
              </span>
            </div>
            <div className="stat-value">
              {s.value}
              <small>{s.unit}</small>
            </div>
            <div className="stat-bottom">
              <span>{s.sub}</span>
              <ArrowUpRight size={15} />
            </div>
          </button>
        ))}
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-main">
          <div className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  每一次练习，都算数 <span className="live-dot" />
                </h2>
                <p>真题与模拟分开看，找到自己的进步节奏</p>
              </div>
              <Select
                value={chartSubject}
                options={["全部科目", ...subjects]}
                onChange={(e) => setChartSubject(e.target.value)}
              />
            </div>
            {chartScores.length ? (
              <ScoreChart scores={chartScores} />
            ) : (
              <div className="chart-empty">
                <div className="chart-empty-grid">
                  <svg viewBox="0 0 600 130" preserveAspectRatio="none">
                    <path
                      d="M0 120 C90 110 80 90 140 98 S210 35 270 60 S370 20 420 35 S520 0 600 10"
                      fill="none"
                      stroke="#b7cdbd"
                      strokeWidth="2"
                      strokeDasharray="5 7"
                    />
                  </svg>
                </div>
                <div>
                  <BarChart3 size={24} />
                  <h3>你的进步曲线，等待第一笔</h3>
                  <p>记录首次考试成绩，开始追踪复习效果</p>
                  <button className="text-btn" onClick={() => onAdd("score")}>
                    记录成绩 <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}
            <div className="panel-foot">
              <span>以得分率比较不同满分的试卷</span>
              <button className="text-btn" onClick={() => onNav("scores")}>
                查看成绩分析
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>最近归档的错题</h2>
                <p>整理，是重新理解的开始</p>
              </div>
              <button className="text-btn" onClick={() => onNav("mistakes")}>
                全部错题
                <ArrowRight size={14} />
              </button>
            </div>
            {data.mistake.length ? (
              <div className="recent-list">
                {data.mistake.slice(0, 3).map((m, i) => (
                  <button key={m.id} onClick={() => onNav("mistakes")}>
                    <span className="recent-index">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{m.title}</strong>
                      <p>
                        {m.subject} · {m.topic}
                      </p>
                    </div>
                    <Badge tone={m.status === "已掌握" ? "green" : "orange"}>
                      {m.status}
                    </Badge>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="compact-empty">
                <span className="empty-icon">
                  <NotebookPen size={24} />
                </span>
                <div>
                  <strong>给错题一个专属位置</strong>
                  <p>记录题目、标注错因，再把薄弱点逐一攻克。</p>
                </div>
                <Button variant="secondary" onClick={() => onAdd("mistake")}>
                  <Plus size={15} />
                  录入错题
                </Button>
              </div>
            )}
          </div>
          <div className="quick-actions">
            <button onClick={() => onAdd("material")}>
              <span className="tile-icon color-0">
                <Plus size={20} />
              </span>
              <div>
                <strong>上传新资料</strong>
                <small>归整你的复习素材</small>
              </div>
              <ArrowUpRight size={18} />
            </button>
            <button onClick={() => onNav("builder")}>
              <span className="tile-icon color-1">
                <Files size={20} />
              </span>
              <div>
                <strong>组一份专项练习</strong>
                <small>把薄弱点练成得分点</small>
              </div>
              <ArrowUpRight size={18} />
            </button>
          </div>
        </div>
        <aside className="dashboard-aside">
          <div className="goal-card">
            <span className="goal-overline">
              <Target size={16} />
              我的备考目标
            </span>
            <h3>{setting?.target || "心有所向，行有所往"}</h3>
            {days !== null ? (
              <div className="countdown">
                <strong>{days}</strong>
                <span>
                  天<br />
                  距离目标考试
                </span>
              </div>
            ) : (
              <p>
                设定一个目标，
                <br />
                让每天的积累更有方向。
              </p>
            )}
            <button onClick={onSettings}>
              {setting?.target || days !== null ? "调整目标" : "设置我的目标"}
              <ArrowRight size={16} />
            </button>
            <div className="goal-art" aria-hidden="true">
              <div />
              <div />
              <div />
            </div>
          </div>
          <div className="panel mastery-panel">
            <div className="panel-heading">
              <h2>错题掌握进度</h2>
              <span className="muted">
                <CircleCheck size={17} />
              </span>
            </div>
            <div className="mastery-body">
              <div
                className="progress-ring"
                style={{
                  background: `conic-gradient(#4e7b62 ${rate}%, #edf0e9 0)`,
                }}
              >
                <div>
                  <strong>
                    {rate}
                    <small>%</small>
                  </strong>
                  <span>掌握率</span>
                </div>
              </div>
              <p>
                已掌握 <strong>{mastered}</strong> / {data.mistake.length} 道
              </p>
              <div className="focus-topics">
                <span className="eyebrow">接下来，可以多练练</span>
                {topics.length ? (
                  topics.map(([t, n]) => (
                    <button key={t} onClick={() => onNav("mistakes")}>
                      <span>{t}</span>
                      <Badge tone="gray">{n} 道</Badge>
                    </button>
                  ))
                ) : (
                  <p className="muted">录入错题后，关注点会在这里出现。</p>
                )}
              </div>
            </div>
          </div>
          <div className="gentle-note">
            <Sparkles size={18} />
            <p>
              不用急着看到全部的台阶，
              <br />
              认真走好眼前的这一级。
            </p>
            <span>KEEP GOING, KEEP GROWING</span>
          </div>
        </aside>
      </div>
      {!data.material.length && !data.mistake.length && !data.score.length && (
        <div className="demo-hint">
          <span>想先了解完整流程？</span>
          <button className="text-btn" onClick={onDemo}>
            浏览示例工作台
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </>
  );
}
