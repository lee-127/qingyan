"use client";
import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  Award,
  ClipboardCheck,
} from "lucide-react";
import { Button, Badge, Empty, Select } from "./ui";
import { ScoreChart } from "./charts";
import { percent, type StudyData, type Entry, type Score } from "@/lib/models";
export function Scores({
  data,
  subjects,
  onAdd,
  onEdit,
  onDelete,
}: {
  data: StudyData;
  subjects: string[];
  onAdd: () => void;
  onEdit: (s: Entry<Score>) => void;
  onDelete: (s: Entry<Score>) => void;
}) {
  const [subject, setSubject] = useState("全部科目"),
    [type, setType] = useState("全部试卷"),
    [rate, setRate] = useState(true),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const rows = data.score
    .filter(
      (s) =>
        (subject === "全部科目" || s.subject === subject) &&
        (type === "全部试卷" || s.type === type) &&
        (!start || s.date >= start) &&
        (!end || s.date <= end),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
  const mean = (t: string) => {
    const r = rows.filter((s) => s.type === t);
    return r.length
      ? (r.reduce((a, s) => a + percent(s), 0) / r.length).toFixed(1) + "%"
      : "—";
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR PROGRESS, VISIBLE</span>
          <h1>成绩分析</h1>
          <p>记录每一次模拟，让进步被看见。</p>
        </div>
        <Button onClick={onAdd}>
          <Plus size={17} />
          记录成绩
        </Button>
      </div>
      <div className="filter-bar">
        <Select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          options={["全部科目", ...subjects]}
        />
        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={["全部试卷", "真题卷", "模拟卷"]}
        />
        <label className="date-filter">
          起始
          <input
            type="date"
            aria-label="起始日期"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="date-filter">
          截止
          <input
            type="date"
            aria-label="截止日期"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <button
          className="text-btn"
          onClick={() => {
            setSubject("全部科目");
            setType("全部试卷");
            setStart("");
            setEnd("");
          }}
        >
          重置筛选
        </button>
      </div>
      <div className="score-stats">
        <div className="mini-stat">
          <span className="tile-icon color-0">
            <ClipboardCheck size={21} />
          </span>
          <div>
            <p>已完成练习</p>
            <strong>
              {rows.length}
              <small>次</small>
            </strong>
          </div>
        </div>
        <div className="mini-stat">
          <span className="tile-icon color-0">
            <Award size={21} />
          </span>
          <div>
            <p>真题平均得分率</p>
            <strong>{mean("真题卷")}</strong>
          </div>
        </div>
        <div className="mini-stat">
          <span className="tile-icon color-1">
            <TrendingUp size={21} />
          </span>
          <div>
            <p>模拟平均得分率</p>
            <strong>{mean("模拟卷")}</strong>
          </div>
        </div>
      </div>
      <div className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>成绩趋势</h2>
            <p>每一个数据点，都来自你的一次认真练习</p>
          </div>
          <div className="segmented">
            <button
              className={rate ? "active" : ""}
              onClick={() => setRate(true)}
            >
              得分率
            </button>
            <button
              className={!rate ? "active" : ""}
              onClick={() => setRate(false)}
            >
              原始分数
            </button>
          </div>
        </div>
        {rows.length ? (
          <ScoreChart scores={rows} rate={rate} />
        ) : (
          <Empty
            title="还没有成绩记录"
            description="记录一次自测成绩，趋势图会在这里慢慢生长。"
          />
        )}
        <div className="chart-note">
          {rate
            ? "得分率 = 得分 ÷ 满分。不同满分的试卷可以用得分率比较。"
            : "原始分数可能对应不同满分；比较时请结合下方明细。"}
          {subject === "全部科目" && " 当前包含多个科目，可筛选单科观察。"}
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <h2>
            考试记录 <span className="count">{rows.length}</span>
          </h2>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>试卷名称</th>
                  <th>科目 / 类型</th>
                  <th>得分 / 满分</th>
                  <th>得分率</th>
                  <th>日期 / 用时</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.title}</strong>
                      {s.note && <small className="table-note">{s.note}</small>}
                    </td>
                    <td>
                      <div className="cell-stack">
                        <span>{s.subject}</span>
                        <Badge tone={s.type === "真题卷" ? "green" : "orange"}>
                          {s.type}
                        </Badge>
                      </div>
                    </td>
                    <td>
                      <span className="score-number">{s.score}</span>
                      <span className="muted"> / {s.total}</span>
                    </td>
                    <td>
                      <div className="rate-cell">
                        <span>{percent(s)}%</span>
                        <div className="progress-track">
                          <i style={{ width: `${percent(s)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <span>{s.date}</span>
                        <small>
                          {s.duration ? s.duration + " 分钟" : "未记录用时"}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title="编辑"
                          aria-label={`编辑${s.title}`}
                          onClick={() => onEdit(s)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger-text"
                          title="删除"
                          aria-label={`删除${s.title}`}
                          onClick={() => onDelete(s)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="暂无符合条件的考试记录"
            description="新增记录，或调整筛选条件。"
          />
        )}
      </div>
    </>
  );
}
