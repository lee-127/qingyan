"use client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { Entry, Score } from "@/lib/models";
import { percent } from "@/lib/models";
export function ScoreChart({
  scores,
  rate = true,
}: {
  scores: Entry<Score>[];
  rate?: boolean;
}) {
  const rows = [...scores]
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    )
    .map((s, i) => ({
      id: i,
      label: s.date.slice(5).replace("-", "/"),
      title: s.title,
      total: s.total,
      score: s.score,
      真题卷: s.type === "真题卷" ? (rate ? percent(s) : s.score) : null,
      模拟卷: s.type === "模拟卷" ? (rate ? percent(s) : s.score) : null,
    }));
  return (
    <div
      className="chart"
      role="img"
      aria-label="成绩趋势折线图，绿色为真题卷，橙色为模拟卷"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 15, right: 20, left: -20, bottom: 4 }}
        >
          <CartesianGrid
            stroke="#ebeee8"
            strokeDasharray="3 5"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8a928b", fontSize: 11 }}
            dy={10}
          />
          <YAxis
            domain={rate ? [0, 100] : [0, "auto"]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8a928b", fontSize: 11 }}
            tickFormatter={(v) => `${v}${rate ? "%" : ""}`}
          />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="chart-tooltip">
                  <strong>{payload[0].payload.title}</strong>
                  <p>
                    {payload[0].payload.score} / {payload[0].payload.total} 分
                  </p>
                  <small>{payload[0].payload.label}</small>
                </div>
              ) : null
            }
          />
          <Legend
            align="right"
            verticalAlign="top"
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ fontSize: 12, paddingBottom: 20 }}
          />
          <Line
            isAnimationActive={false}
            name="真题卷"
            type="monotone"
            dataKey="真题卷"
            connectNulls
            stroke="#42755d"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
          <Line
            isAnimationActive={false}
            name="模拟卷"
            type="monotone"
            dataKey="模拟卷"
            connectNulls
            stroke="#cf9860"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
